"""
GitHub Service - Handles GitHub API operations for repository invitations
"""

import os

import httpx


class GitHubService:
    """Service for interacting with GitHub API"""

    def __init__(self, token: str | None = None):
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.api_base = "https://api.github.com"
        self.headers = (
            {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "X-GitHub-Api-Version": "2022-11-28",
            }
            if self.token
            else {}
        )

    def is_configured(self) -> bool:
        """Check if GitHub token is configured"""
        return bool(self.token)

    def parse_repo_name(self, repo_url: str) -> str | None:
        """Extract owner/repo from GitHub URL"""
        # Handle various GitHub URL formats
        # https://github.com/owner/repo
        # https://github.com/owner/repo.git
        # git@github.com:owner/repo.git

        repo_url = repo_url.strip()

        # Remove .git suffix
        if repo_url.endswith(".git"):
            repo_url = repo_url[:-4]

        # Handle HTTPS URLs
        if "github.com/" in repo_url:
            parts = repo_url.split("github.com/")
            if len(parts) == 2:
                return parts[1]

        # Handle SSH URLs
        if "git@github.com:" in repo_url:
            parts = repo_url.split("git@github.com:")
            if len(parts) == 2:
                return parts[1]

        return None

    def send_invitation(
        self, repo_name: str, github_username: str, role: str = "direct_member"
    ) -> dict:
        """
        Send a repository invitation to a GitHub user

        Args:
            repo_name: Format "owner/repo"
            github_username: GitHub username to invite
            role: "direct_member", "admin", "maintain", "write", "triage", or "read"

        Returns:
            Dict with status and message
        """
        if not self.is_configured():
            return {
                "success": False,
                "message": "GitHub token not configured. Set GITHUB_TOKEN environment variable.",
            }

        if not repo_name or not github_username:
            return {"success": False, "message": "Repository name and GitHub username are required"}

        url = f"{self.api_base}/repos/{repo_name}/collaborators/{github_username}"

        data = {"permission": role}

        try:
            response = httpx.put(url, headers=self.headers, json=data, timeout=30)

            if response.status_code == 201:
                return {
                    "success": True,
                    "message": f"Invitation sent to {github_username} for {repo_name}",
                    "invitation_id": response.json().get("id"),
                }
            elif response.status_code == 204:
                return {
                    "success": True,
                    "message": f"{github_username} is already a collaborator on {repo_name}",
                }
            elif response.status_code == 404:
                return {
                    "success": False,
                    "message": f"Repository {repo_name} not found or you don't have admin access",
                }
            elif response.status_code == 422:
                return {
                    "success": False,
                    "message": f"Invalid request. User {github_username} may not exist or already has a pending invitation",
                }
            else:
                return {
                    "success": False,
                    "message": f"GitHub API error: {response.status_code} - {response.text}",
                }

        except httpx.RequestError as e:
            return {"success": False, "message": f"Network error: {e!s}"}

    def send_bulk_invitations(
        self, repo_name: str, github_usernames: list[str], role: str = "direct_member"
    ) -> dict:
        """
        Send invitations to multiple GitHub users

        Returns:
            Dict with results for each user
        """
        results = []

        for username in github_usernames:
            result = self.send_invitation(repo_name, username, role)
            results.append({"username": username, **result})

        successful = [r for r in results if r["success"]]
        failed = [r for r in results if not r["success"]]

        return {
            "total": len(results),
            "successful": len(successful),
            "failed": len(failed),
            "results": results,
        }

    def get_repo_info(self, repo_name: str) -> dict | None:
        """Get repository information"""
        if not self.is_configured():
            return None

        url = f"{self.api_base}/repos/{repo_name}"

        try:
            response = httpx.get(url, headers=self.headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                return {
                    "name": data.get("name"),
                    "full_name": data.get("full_name"),
                    "private": data.get("private"),
                    "html_url": data.get("html_url"),
                    "description": data.get("description"),
                }
            return None
        except httpx.RequestError:
            return None

    def validate_repo_access(self, repo_name: str) -> bool:
        """Check if the configured token has admin access to the repo"""
        if not self.is_configured():
            return False

        url = f"{self.api_base}/repos/{repo_name}"

        try:
            response = httpx.get(url, headers=self.headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                permissions = data.get("permissions", {})
                return permissions.get("admin", False) or permissions.get("maintain", False)
            return False
        except httpx.RequestError:
            return False


# Singleton instance
github_service = GitHubService()
