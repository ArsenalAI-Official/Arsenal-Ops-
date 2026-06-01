"""
Architecture Generator Service - AI-powered PRD analysis and architecture generation
"""

import asyncio
import json
import os
from typing import Any

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
            print(f"[WARNING] Failed to initialize OpenAI client: {e}")
            _client = None
    return _client


DEPLOYMENT_NAME = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


class ArchitectureGenerator:
    """AI service for analyzing PRDs and generating architectures"""

    def __init__(self):
        self.deployment = DEPLOYMENT_NAME

    @property
    def client(self):
        """Lazy client access"""
        return get_openai_client()

    async def analyze_prd(
        self, prd_content: str, project_name: str, additional_context: str = ""
    ) -> dict[str, Any]:
        """
        Analyze PRD as a PM/Product Manager
        Returns: cost analysis, recommended tools, project summary
        """
        prompt = f"""You are an expert Product Manager and Technical Architect. Analyze this PRD thoroughly.

PROJECT NAME: {project_name}

PRD CONTENT:
{prd_content[:8000]}

ADDITIONAL CONTEXT:
{additional_context}

Perform a comprehensive analysis including:

1. PROJECT SUMMARY: Brief overview of what the project is about (2-3 sentences)

2. KEY FEATURES: List of 5-10 main features to be built

3. TECHNICAL REQUIREMENTS: List of 5-10 technologies and technical requirements

4. COST ANALYSIS (provide realistic estimates):
   - infrastructure: object with:
     - monthly: string like "$500-1000/month"
     - annual: string like "$6000-12000/year"
     - breakdown: array of {{item: string, cost: string}} for cloud, database, CDN, etc.
   - development: object with:
     - total: string like "$50,000-80,000"
     - breakdown: array of {{item: string, cost: string}} for frontend, backend, testing, etc.
   - total_estimated: string like "$56,000-92,000 total"

5. RECOMMENDED TOOLS (provide specific tool names):
   - frontend: list of 2-4 tools (e.g., ["React", "TypeScript", "Tailwind CSS"])
   - backend: list of 2-4 tools (e.g., ["FastAPI", "PostgreSQL", "Redis"])
   - database: list of 1-2 tools
   - devops: list of 2-4 tools (e.g., ["Docker", "GitHub Actions", "AWS"])

6. RISK ASSESSMENT: 3-5 risks with:
   - risk: description of the risk
   - impact: High/Medium/Low
   - mitigation: how to address it

7. TIMELINE: 4-6 phases with:
   - phase: name of the phase (e.g., "Planning & Design")
   - duration: string like "2-3 weeks"
   - tasks: list of 3-5 specific tasks for this phase

Return as valid JSON with these exact keys:
- summary (string)
- key_features (array of strings)
- technical_requirements (array of strings)
- cost_analysis (object with infrastructure, development, total_estimated)
- recommended_tools (object with frontend, backend, database, devops arrays)
- risks (array of objects with risk, impact, mitigation)
- timeline (array of objects with phase, duration, tasks)
"""

        try:
            client = self.client
            deployment = self.deployment
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=deployment,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"[AI ERROR] analyze_prd failed: {str(e)}")
            return {
                "error": str(e),
                "summary": "Unable to analyze PRD",
                "key_features": [],
                "technical_requirements": [],
                "cost_analysis": {},
                "recommended_tools": {},
                "risks": [],
                "timeline": [],
            }

    async def generate_architectures(
        self, prd_content: str, project_name: str, analysis: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Generate 2 architecture diagrams based on PRD analysis
        Returns: Recommended and Alternative architectures with Mermaid code
        """
        tools_str = json.dumps(analysis.get("recommended_tools", {}), indent=2)
        features_str = "\n".join(f"- {f}" for f in analysis.get("key_features", []))

        prompt = f"""You are a Senior Solutions Architect. Based on this PRD analysis, create 2 architecture designs.

PROJECT: {project_name}

KEY FEATURES:
{features_str}

RECOMMENDED TOOLS:
{tools_str}

PRD EXCERPT:
{prd_content[:4000]}

Create TWO architectures:

1. RECOMMENDED ARCHITECTURE: The optimal, production-ready architecture using best practices and modern tools. This should be comprehensive and scalable.

2. ALTERNATIVE ARCHITECTURE: A simpler, cost-effective alternative that could work for MVP or smaller scale. This should be faster to implement.

For each architecture provide:
- name: Architecture name
- description: 2-3 sentence description
- mermaid_code: Valid Mermaid flowchart/graph code (use graph TB or graph LR)
- pros: List of advantages
- cons: List of disadvantages
- estimated_cost: Monthly infrastructure cost estimate
- complexity: low/medium/high
- time_to_implement: Estimated weeks

IMPORTANT MERMAID RULES:
- Use graph TB (top to bottom) or graph LR (left to right)
- Use simple node names without special characters
- Use --> for connections
- Group related components with subgraphs
- Keep it clean and readable
- Do NOT use styling, classDef, or fill colors

Example Mermaid format:
```
graph TB
    subgraph Frontend
        A[React App]
        B[CDN]
    end
    subgraph Backend
        C[API Gateway]
        D[Auth Service]
        E[Core API]
    end
    subgraph Data
        F[PostgreSQL]
        G[Redis Cache]
    end
    A --> B
    B --> C
    C --> D
    C --> E
    E --> F
    E --> G
```

Return as JSON with keys:
- recommended (object with name, description, mermaid_code, pros, cons, estimated_cost, complexity, time_to_implement)
- alternative (object with same fields)
"""

        try:
            client = self.client
            deployment = self.deployment
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=deployment,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
            )
            result = json.loads(response.choices[0].message.content)

            # Validate mermaid code
            for arch_type in ["recommended", "alternative"]:
                if arch_type in result:
                    code = result[arch_type].get("mermaid_code", "")
                    # Clean up common issues
                    if not code.startswith("graph"):
                        code = "graph TB\n" + code
                    result[arch_type]["mermaid_code"] = code

            return result
        except Exception as e:
            # Return fallback architectures
            return {
                "error": str(e),
                "recommended": {
                    "name": "Standard Web Architecture",
                    "description": "A standard three-tier web architecture with React frontend, FastAPI backend, and PostgreSQL database.",
                    "mermaid_code": """graph TB
    subgraph Frontend
        A[React App]
        B[Nginx]
    end
    subgraph Backend
        C[FastAPI]
        D[Celery Workers]
    end
    subgraph Data
        E[PostgreSQL]
        F[Redis]
    end
    A --> B
    B --> C
    C --> D
    C --> E
    C --> F""",
                    "pros": ["Scalable", "Well-documented", "Industry standard"],
                    "cons": ["Higher initial complexity", "More infrastructure"],
                    "estimated_cost": "$200-500/month",
                    "complexity": "medium",
                    "time_to_implement": "8-12 weeks",
                },
                "alternative": {
                    "name": "Simple Monolith",
                    "description": "A simple monolithic architecture suitable for MVP and small-scale deployments.",
                    "mermaid_code": """graph TB
    A[React Frontend] --> B[FastAPI Backend]
    B --> C[PostgreSQL]
    B --> D[File Storage]""",
                    "pros": ["Simple to deploy", "Lower cost", "Faster development"],
                    "cons": ["Limited scalability", "Single point of failure"],
                    "estimated_cost": "$50-100/month",
                    "complexity": "low",
                    "time_to_implement": "4-6 weeks",
                },
            }

    async def generate_tickets_from_architecture(
        self,
        architecture: dict[str, Any],
        developers: list[dict[str, Any]],
        project_name: str,
        start_date=None,
        end_date=None,
        prd_analysis: dict[str, Any] = None,
    ) -> dict[str, Any]:
        """
        Generate Jira tickets from selected architecture and PRD analysis
        Assign to developers based on their specialization
        If timeline is provided, divide tickets into sprints
        """
        arch_name = architecture.get("name", "Architecture")
        arch_desc = architecture.get("description", "")
        mermaid_code = architecture.get("mermaid_code", "")

        # Build PRD context if available
        prd_context = ""
        if prd_analysis:
            summary = prd_analysis.get("summary", "")
            key_features = prd_analysis.get("key_features", [])
            tech_reqs = prd_analysis.get("technical_requirements", [])
            timeline_data = prd_analysis.get("timeline", [])

            prd_context = f"""
PRD ANALYSIS:
- Summary: {summary}
- Key Features: {", ".join(key_features[:10]) if key_features else "Not specified"}
- Technical Requirements: {", ".join(tech_reqs[:10]) if tech_reqs else "Not specified"}
- Timeline Phases: {len(timeline_data)} phases planned
"""
            if timeline_data:
                prd_context += "\nPRD Timeline:\n"
                for phase in timeline_data[:5]:
                    prd_context += (
                        f"  - {phase.get('phase', 'Unknown')}: {phase.get('duration', 'TBD')}\n"
                    )

        # Format developers info
        devs_info = []
        for dev in developers:
            devs_info.append(
                f"- {dev['name']} ({dev.get('role', 'Developer')}): {dev.get('responsibilities', 'General development')}"
            )
        devs_str = "\n".join(devs_info) if devs_info else "No developers assigned"

        # Build timeline context if provided
        timeline_context = ""
        sprint_instructions = ""

        if start_date and end_date:
            total_days = (end_date - start_date).days
            total_weeks = total_days // 7
            # Standard 2-week sprints
            num_sprints = max(1, total_weeks // 2)

            timeline_context = f"""
PROJECT TIMELINE:
- Start Date: {start_date.strftime("%Y-%m-%d")}
- End Date: {end_date.strftime("%Y-%m-%d")}
- Total Duration: {total_weeks} weeks
- Number of Sprints: {num_sprints} (2-week sprints)
"""

            sprint_instructions = f"""
SPRINT PLANNING REQUIREMENTS:
- Divide all tickets into {num_sprints} sprints
- Each sprint is 2 weeks (10 working days)
- Sprint 1 starts on {start_date.strftime("%Y-%m-%d")}
- Order tickets by priority and dependencies
- Infrastructure and setup tasks go in early sprints
- Testing and documentation go in later sprints
- Assign sprint_number (1-{num_sprints}) to each ticket
- For each sprint, provide:
  - name: Sprint name (e.g., "Sprint 1: Foundation")
  - goal: Sprint goal in one sentence
  - start_date: ISO date (YYYY-MM-DD)
  - end_date: ISO date (YYYY-MM-DD)
  - capacity_hours: Estimated team capacity (hours)
"""

        prompt = f"""You are a Senior PM creating Jira tickets for a development project.

PROJECT: {project_name}
ARCHITECTURE: {arch_name}
ARCHITECTURE DESCRIPTION: {arch_desc}

ARCHITECTURE DIAGRAM:
{mermaid_code}
{prd_context}
AVAILABLE DEVELOPERS:
{devs_str}
{timeline_context}

Create a comprehensive set of Jira tickets to implement this architecture. For each ticket:

1. Analyze the architecture components and PRD requirements
2. Break down into implementable tasks
3. Assign to the most suitable developer based on their role/responsibilities
4. Estimate story points and hours
{sprint_instructions}

IMPORTANT ASSIGNMENT RULES:
- Only assign a ticket to a developer if their role/specialization matches the task
- If no developer has the required specialization (e.g., testing, QA, DevOps), set assignee_name to "Unassigned"
- Examples: If there's no QA specialist, keep testing tickets unassigned. If there's no DevOps, keep CI/CD tickets unassigned.
- Always explain the assignment reasoning in assignee_reasoning field

Create tickets for:
- Infrastructure setup
- Frontend components
- Backend services/APIs
- Database setup and models
- Authentication/Authorization
- Testing
- Documentation
- DevOps/CI/CD

For each ticket provide:
- title: Concise, action-oriented title
- description: Detailed requirements and acceptance criteria
- type: epic/user_story/task/bug
- priority: critical/high/medium/low
- story_points: 1, 2, 3, 5, 8, or 13
- estimated_hours: Realistic estimate
- assignee_name: Name of the developer (must match exactly from the list above), or "Unassigned" if no suitable developer exists
- assignee_reasoning: Why this developer was chosen, or why it's unassigned (e.g., "No QA specialist available")
- tags: Relevant labels
- dependencies: List of ticket titles this depends on
- sprint_number: Which sprint this belongs to (only if timeline provided)

Return as JSON with keys:
- tickets (list of ticket objects)
- sprints (list of sprint objects with name, goal, start_date, end_date, capacity_hours, number) - only if timeline provided
- total_story_points: Sum of all story points
- total_estimated_hours: Sum of all hours
- sprint_recommendation: How to organize into sprints
"""

        try:
            client = self.client
            deployment = self.deployment
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=deployment,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
            )
            result = json.loads(response.choices[0].message.content)

            # Map assignee names to developer IDs
            dev_name_to_id = {dev["name"].lower(): dev["id"] for dev in developers}

            for ticket in result.get("tickets", []):
                assignee_name = ticket.get("assignee_name", "").lower().strip()
                # If unassigned or no match, keep as unassigned
                if assignee_name == "unassigned" or assignee_name not in dev_name_to_id:
                    ticket["assignee_name"] = "Unassigned"
                    ticket["assignee_id"] = None
                else:
                    ticket["assignee_id"] = dev_name_to_id.get(assignee_name)

            return result
        except Exception as e:
            return {
                "error": str(e),
                "tickets": [],
                "sprints": [],
                "total_story_points": 0,
                "total_estimated_hours": 0,
                "sprint_recommendation": "Unable to generate tickets",
            }

    def match_developer_to_ticket(
        self, ticket: dict[str, Any], developers: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        """
        Match a ticket to the most suitable developer based on skills
        """
        if not developers:
            return None

        ticket_title = ticket.get("title", "").lower()
        ticket_desc = ticket.get("description", "").lower()
        ticket_tags = [t.lower() for t in ticket.get("tags", [])]

        best_match = None
        best_score = 0

        for dev in developers:
            score = 0
            role = dev.get("role", "").lower()
            responsibilities = dev.get("responsibilities", "").lower()

            # Check for keyword matches
            keywords = role.split() + responsibilities.split()

            for keyword in keywords:
                if len(keyword) > 3:  # Ignore short words
                    if keyword in ticket_title:
                        score += 3
                    if keyword in ticket_desc:
                        score += 1
                    if keyword in ticket_tags:
                        score += 2

            # Role-based matching
            if "frontend" in role and any(
                k in ticket_title for k in ["ui", "frontend", "react", "css", "component"]
            ):
                score += 5
            if "backend" in role and any(
                k in ticket_title for k in ["api", "backend", "database", "server"]
            ):
                score += 5
            if "devops" in role and any(
                k in ticket_title for k in ["deploy", "ci/cd", "infrastructure", "docker"]
            ):
                score += 5
            if ("ai" in role or "ml" in role) and any(
                k in ticket_title for k in ["ai", "ml", "model", "llm"]
            ):
                score += 5

            if score > best_score:
                best_score = score
                best_match = dev

        return best_match

    async def refine_architecture(
        self,
        current_mermaid_code: str,
        change_instructions: str,
        architecture_name: str,
        project_name: str,
    ) -> dict[str, Any]:
        """
        Refine an architecture based on user's plain English instructions.
        Takes the current Mermaid code and change description, returns updated architecture.
        """
        prompt = f"""You are a Senior Solutions Architect. A user wants to modify an existing architecture.

PROJECT: {project_name}
ARCHITECTURE NAME: {architecture_name}

CURRENT ARCHITECTURE (Mermaid Code):
```
{current_mermaid_code}
```

USER'S REQUESTED CHANGES:
{change_instructions}

Your task:
1. Understand the current architecture from the Mermaid code
2. Apply the user's requested changes
3. Generate an updated Mermaid diagram
4. Explain what changes were made

IMPORTANT MERMAID RULES:
- Use graph TB (top to bottom) or graph LR (left to right)
- Use simple node names without special characters
- Use --> for connections
- Group related components with subgraphs
- Keep it clean and readable
- Do NOT use styling, classDef, or fill colors
- Maintain the overall structure while applying changes

Return as JSON with keys:
- mermaid_code: The updated Mermaid diagram code
- description: Updated description of the architecture (2-3 sentences)
- changes_applied: List of specific changes that were made
- pros: Updated list of advantages after changes
- cons: Updated list of disadvantages after changes
- ai_notes: Any recommendations or notes about the changes
"""

        try:
            client = self.client
            deployment = self.deployment
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=deployment,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
            )
            result = json.loads(response.choices[0].message.content)

            # Validate mermaid code
            code = result.get("mermaid_code", "")
            if code and not code.strip().startswith("graph"):
                code = "graph TB\n" + code
            result["mermaid_code"] = code

            return result
        except Exception as e:
            return {
                "error": str(e),
                "mermaid_code": current_mermaid_code,
                "description": "",
                "changes_applied": ["Unable to process changes"],
                "pros": [],
                "cons": [],
                "ai_notes": f"AI processing failed: {str(e)}",
            }


# Singleton instance
architecture_generator = ArchitectureGenerator()
