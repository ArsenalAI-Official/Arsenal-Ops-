"""
Roadmap AI Parser - Intelligent Excel parsing using LLM
Handles flexible Excel structures and data variations robustly
Falls back from strict column-based parsing to AI-powered parsing
"""

import asyncio
import datetime
import json
import os
from typing import Any

from logging_config import setup_logger

logger = setup_logger("roadmap_ai_parser")


# Lazy initialization of the OpenAI client to prevent startup crashes
_client = None


def get_openai_client():
    """Get or create the OpenAI client"""
    global _client
    if _client is None:
        try:
            from openai import OpenAI

            _client = OpenAI(
                api_key=os.getenv("OPENAI_API_KEY", ""),
                timeout=90.0,
            )
        except Exception as e:
            logger.warning(f"Failed to initialize OpenAI client: {e}")
            _client = None
    return _client


MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


class RoadmapAIParser:
    """AI service for intelligently parsing roadmap Excel files regardless of structure"""

    def __init__(self):
        self.model = MODEL_NAME

    @property
    def client(self):
        """Lazy client access"""
        return get_openai_client()

    async def parse_excel_with_ai(self, excel_content: str, filename: str) -> dict[str, Any]:
        """
        Use LLM to intelligently parse Excel content and extract structured roadmap data

        Args:
            excel_content: Human-readable Excel content (CSV-like text representation)
            filename: Name of the Excel file

        Returns:
            Structured roadmap data in standard format (matches parser.py output)
        """
        if not self.client:
            raise ValueError("LLM client not initialized. Check OPENAI_API_KEY.")

        prompt = f"""You are an expert at parsing product roadmap Excel files in any format.

Your task: Extract and structure roadmap data from the provided Excel content.

STRUCTURE TO IDENTIFY:
1. MILESTONES - Major phases/releases with week dates
2. EPICS - Large features, associated with milestones
3. TASKS - Individual work items with assignee, effort, and weekly hours

IMPORTANT RULES:
- Be flexible with column names and positions
- Match row types case-insensitively (TASK, Task, task, STORY, Story, etc.)
- Extract effort hours from any column mentioning: effort, hours, hrs, estimate, man-hours
- Infer effort from week values if effort column is missing
- Extract assignee names even with spelling variations
- Default priority to "medium" if not specified
- Calculate week dates and create week_hours mappings
- Identify scheduling conflicts (>40 hrs/week per assignee)
- Identify parallel tasks (multiple assignees in same week)

REQUIRED OUTPUT FORMAT (valid JSON with all these keys):
{{
    "meta": {{
        "file": "{filename}",
        "parsed_at": "ISO_DATETIME",
        "week_range": {{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}},
        "total_weeks": NUMBER,
        "total_tasks": NUMBER,
        "total_assignees": NUMBER
    }},
    "tickets": [
        {{
            "row": NUMBER,
            "name": "STRING",
            "description": "STRING_OR_NULL",
            "milestone": "STRING_OR_NULL",
            "epic": "STRING_OR_NULL",
            "priority": "high|medium|low",
            "effort_hrs": NUMBER_OR_NULL,
            "assignee": "STRING_OR_NULL",
            "week_hours": {{"YYYY-MM-DD": NUMBER, ...}},
            "planned_total": NUMBER,
            "active_weeks": ["YYYY-MM-DD", ...]
        }}
    ],
    "schedule": {{
        "ASSIGNEE_NAME": {{
            "YYYY-MM-DD": {{"total_hrs": NUMBER, "tasks": ["NAME", ...]}}
        }}
    }},
    "conflicts": [
        {{
            "assignee": "STRING",
            "week": "YYYY-MM-DD",
            "total_hrs": NUMBER,
            "tasks": ["STRING", ...],
            "overbooked": BOOLEAN
        }}
    ],
    "parallel_tasks": [
        {{
            "week": "YYYY-MM-DD",
            "task_a": "STRING",
            "assignee_a": "STRING",
            "task_b": "STRING",
            "assignee_b": "STRING"
        }}
    ],
    "availability": {{
        "ASSIGNEE_NAME": {{
            "last_busy_week": "YYYY-MM-DD_OR_NULL",
            "first_free_week": "YYYY-MM-DD_OR_NULL",
            "total_tasks": NUMBER,
            "total_hrs_planned": NUMBER
        }}
    }},
    "warnings": [
        {{
            "row": NUMBER,
            "task": "STRING",
            "issue": "unassigned|effort_mismatch|no_weeks_planned",
            "detail": "STRING"
        }}
    ]
}}

EXCEL CONTENT:
{excel_content}

Return ONLY the JSON object, no explanations."""

        try:
            client = self.client
            model = self.model

            # Use asyncio.to_thread to call the synchronous OpenAI client in async context
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a data extraction expert. Extract roadmap data from Excel and return ONLY valid JSON.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                )
            )

            parsed = json.loads(response.choices[0].message.content)

            # Validate required keys
            required_keys = [
                "meta",
                "tickets",
                "schedule",
                "conflicts",
                "parallel_tasks",
                "availability",
                "warnings",
            ]
            missing_keys = [k for k in required_keys if k not in parsed]
            if missing_keys:
                raise ValueError(f"Missing required keys: {', '.join(missing_keys)}")

            # Ensure all arrays exist and are lists
            for key in ["tickets", "conflicts", "parallel_tasks", "warnings"]:
                if not isinstance(parsed.get(key), list):
                    parsed[key] = []

            # Ensure schedule and availability are dicts
            if not isinstance(parsed.get("schedule"), dict):
                parsed["schedule"] = {}
            if not isinstance(parsed.get("availability"), dict):
                parsed["availability"] = {}

            # Ensure meta has expected structure
            if "meta" not in parsed or not isinstance(parsed["meta"], dict):
                parsed["meta"] = {}

            if "parsed_at" not in parsed["meta"]:
                parsed["meta"]["parsed_at"] = datetime.datetime.now().isoformat()

            return parsed

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode failed: {str(e)}")
            raise ValueError(f"LLM returned invalid JSON: {str(e)}") from e
        except Exception as e:
            logger.error(f"parse_excel_with_ai failed: {str(e)}")
            raise ValueError(f"LLM parsing failed: {str(e)}") from e


def excel_to_readable_text(filepath: str) -> str:
    """Convert Excel file to readable text format for LLM"""
    try:
        import openpyxl

        wb = openpyxl.load_workbook(filepath, data_only=True)
        ws = wb.active

        lines = []
        lines.append(f"=== Excel Sheet: {ws.title} ===\n")

        # Read all rows with data
        for row_idx, row in enumerate(ws.iter_rows(values_only=True), 1):
            # Skip completely empty rows
            if all(cell is None for cell in row):
                continue

            # Format row: "Row N: Col1 | Col2 | Col3"
            row_str = " | ".join(str(cell) if cell is not None else "" for cell in row)
            lines.append(f"Row {row_idx}: {row_str}")

        return "\n".join(lines)

    except Exception as e:
        raise ValueError(f"Failed to read Excel as text: {str(e)}") from e


# Singleton instance
_parser_instance = None


def get_roadmap_ai_parser() -> RoadmapAIParser:
    """Get or create the roadmap AI parser"""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = RoadmapAIParser()
    return _parser_instance
