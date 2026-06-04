"""
LLM Agent Service - Core AI capabilities for Arsenal Ops
Uses the OpenAI API with structured outputs for agentic tasks
"""

import asyncio
import json
import os
from typing import Any

from pydantic import BaseModel

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


# Pydantic models for structured outputs
class GeneratedTask(BaseModel):
    title: str
    description: str
    priority: str
    story_points: int
    acceptance_criteria: list[str]
    dependencies: list[str]
    epic: str | None = None


class GeneratedUserStory(BaseModel):
    title: str
    as_a: str
    i_want: str
    so_that: str
    acceptance_criteria: list[str]
    story_points: int
    priority: str


class GeneratedMilestone(BaseModel):
    name: str
    phase: str
    duration_weeks: int
    deliverables: list[str]
    dependencies: list[str]


class GeneratedPersona(BaseModel):
    name: str
    role: str
    age_range: str
    company_size: str
    goals: list[str]
    pain_points: list[str]
    motivations: list[str]
    bio: str
    quote: str


class MarketAnalysis(BaseModel):
    tam: str
    sam: str
    som: str
    cagr: float
    key_trends: list[str]
    opportunities: list[str]
    threats: list[str]
    competitors: list[dict[str, Any]]


class LLMAgent:
    """Agentic LLM service for PM tasks using the OpenAI API"""

    def __init__(self, model: str = None):
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

    async def generate_jira_tickets(
        self, feature_description: str, epic_name: str = ""
    ) -> list[dict[str, Any]]:
        """Generate Jira-ready tickets from a feature description"""
        prompt = f"""You are a Senior PM creating Jira tickets. Generate tickets for:

FEATURE: {feature_description}
EPIC: {epic_name or "Core Product"}

Create 5-8 Jira tickets with:
- title (concise, action-oriented)
- description (detailed requirements)
- acceptance_criteria (list of specific criteria)
- story_points (1, 2, 3, 5, 8, 13)
- priority (critical, high, medium, low)
- labels (list of relevant labels)
- jira_key (format: PROD-XXX)

Return as JSON with key: tickets"""

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

    async def create_timeline(self, project_description: str, team_size: int = 5) -> dict[str, Any]:
        """Generate a project timeline with Gantt-chart ready data"""
        prompt = f"""You are a Project Planning expert. Create a timeline for:

PROJECT: {project_description}
TEAM SIZE: {team_size} people

Create a timeline with:
1. 4 phases: Discovery, Build, Launch, Scale
2. Each phase has start_week, end_week, milestones
3. Dependencies between phases
4. Risk factors and mitigation

Return as JSON with keys: phases, total_weeks, critical_path, risks"""

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

    async def analyze_market(
        self, industry: str, product: str, competitors: list[str] = None
    ) -> dict[str, Any]:
        """Deep market research and competitor analysis"""
        competitor_text = ", ".join(competitors) if competitors else "Unknown competitors"
        prompt = f"""You are a Market Research Analyst. Analyze:

INDUSTRY: {industry}
PRODUCT: {product}
KNOWN COMPETITORS: {competitor_text}

Provide comprehensive analysis:
1. Market sizing (TAM, SAM, SOM) with realistic estimates
2. CAGR and growth projections
3. Competitor analysis (strengths, weaknesses, positioning)
4. SWOT analysis
5. Key trends and opportunities
6. Entry barriers and threats

Return as JSON with keys: market_size, competitors, swot, trends, opportunities, threats"""

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

    async def generate_personas(
        self, product: str, target_market: str, count: int = 3
    ) -> list[dict[str, Any]]:
        """Generate detailed buyer personas"""
        prompt = f"""You are a GTM Strategist. Create {count} buyer personas for:

PRODUCT: {product}
TARGET MARKET: {target_market}

For each persona include:
- name (creative like "Enterprise Emma")
- role (job title)
- age_range
- company_size
- goals (3-4 goals)
- pain_points (3-4 pain points)
- motivations (3-4 motivations)
- decision_criteria (what they look for)
- preferred_channels (how they research)
- bio (2-3 sentence description)
- quote (representative quote)

Return as JSON with key: personas"""

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

    async def draft_release_notes(
        self, version: str, features: list[str], fixes: list[str], tone: str = "professional"
    ) -> dict[str, Any]:
        """Generate professional release notes"""
        prompt = f"""You are a Technical Writer. Create release notes for:

VERSION: {version}
NEW FEATURES: {json.dumps(features)}
BUG FIXES: {json.dumps(fixes)}
TONE: {tone}

Create release notes with:
- headline (catchy summary)
- summary (2-3 sentences)
- features_formatted (detailed feature descriptions)
- fixes_formatted (bug fix descriptions)
- upgrade_notes (any migration steps)
- known_issues (potential issues)

Return as JSON"""

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

    async def generate_stakeholder_brief(
        self, project: str, audience: str, key_metrics: dict = None
    ) -> dict[str, Any]:
        """Generate executive stakeholder communication"""
        metrics_text = json.dumps(key_metrics) if key_metrics else "{}"
        prompt = f"""You are an Executive Communications expert. Create a stakeholder brief for:

PROJECT: {project}
AUDIENCE: {audience}
KEY METRICS: {metrics_text}

Create a brief with:
- executive_summary (3-4 sentences)
- key_highlights (3-5 bullet points)
- metrics_summary (formatted metrics)
- risks_and_mitigations
- next_steps (clear action items)
- ask (what you need from stakeholders)

Return as JSON"""

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

    async def brainstorm_ideas(self, problem: str, constraints: list[str] = None) -> dict[str, Any]:
        """Generate creative product ideas and scenarios"""
        constraints_text = ", ".join(constraints) if constraints else "None specified"
        prompt = f"""You are a Product Innovation expert. Brainstorm for:

PROBLEM: {problem}
CONSTRAINTS: {constraints_text}

Generate:
1. 5-7 creative solution ideas (with brief descriptions)
2. 3 scenario plans (optimistic, realistic, pessimistic)
3. Quick wins (immediate implementations)
4. Moonshots (ambitious long-term ideas)
5. Competitive differentiation angles

Return as JSON with keys: ideas, scenarios, quick_wins, moonshots, differentiators"""

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

    async def generate_strategy_ideation(
        self, product: str, description: str, target_market: str
    ) -> dict[str, Any]:
        """Generate product ideas and concepts"""
        prompt = f"""You are a Head of Product. Ideate for:
PRODUCT: {product}
DESCRIPTION: {description}
TARGET MARKET: {target_market}

1. Generate 15-20 creative ideas grouped into 4-6 categories.
2. Select top 3 concepts with tradeoffs (User Value, Complexity, Risk, Why Now).

Return as JSON with keys: ideas_grouped (list of {{category, ideas}}), concepts (list of {{name, description, user_value, complexity, risk, why_now, tradeoffs}})"""

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

    async def generate_market_sizing(
        self, product: str, target_market: str, assumptions: list[str] = None
    ) -> dict[str, Any]:
        """Generate TAM/SAM/SOM market sizing"""
        assumptions_text = ", ".join(assumptions) if assumptions else "None"
        prompt = f"""You are a Strategy Consultant. Estimate market size for:
PRODUCT: {product}
TARGET MARKET: {target_market}
ASSUMPTIONS: {assumptions_text}

Provide TAM, SAM, SOM with reasoning and assumptions.

Return as JSON with keys: tam (value + reasoning), sam (value + reasoning), som (value + reasoning), assumptions (list)"""

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

    async def generate_scenario_planning(self, product: str, strategy: str) -> dict[str, Any]:
        """Generate best/base/worst case scenarios"""
        prompt = f"""You are a Risk Manager. Create scenario planning for:
PRODUCT: {product}
STRATEGY: {strategy}

Create 3 scenarios (Best, Base, Worst) with probability, impact, and mitigation strategies.

Return as JSON with keys: scenarios (list of {{name, probability, description, impact, mitigation}})"""

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
