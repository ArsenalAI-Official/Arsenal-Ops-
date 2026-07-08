"""
LLM Agent Service - Core AI capabilities for Arsenal Ops
Uses the OpenAI API with structured outputs for agentic tasks
"""

import asyncio
import json
import os
from typing import Any

# Lazy initialization of the OpenAI client
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
            print(f"[WARNING] Failed to initialize OpenAI client: {e}")
            _client = None
    return _client


# Default model name
MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


class LLMAgent:
    """Agentic LLM service for PM tasks using the OpenAI API"""

    def __init__(self, model: str | None = None):
        self.model = model or MODEL_NAME

    @property
    def client(self):
        """Lazy client access"""
        return get_openai_client()

    async def decompose_project(
        self, project_description: str, target_market: str = ""
    ) -> dict[str, Any]:
        """Break a project description into tasks, milestones, and user stories"""
        prompt = f"""You are an expert Product Manager. Analyze this project and create a complete breakdown:

PROJECT: {project_description}
TARGET MARKET: {target_market}

Create a structured project plan with:
1. 4-6 high-level milestones (phases: Discovery, Build, Launch, Scale)
2. 8-12 detailed tasks with dependencies
3. 5-8 user stories in proper format

Return as JSON with keys: milestones, tasks, user_stories"""

        client = self.client
        model = self.model
        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=1,
            )
        )
        return json.loads(response.choices[0].message.content)


# Singleton instance
llm_agent = LLMAgent()
