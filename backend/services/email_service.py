"""
Email Service - Handle all email notifications
Supports Gmail SMTP and generic SMTP configurations
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending email notifications"""
    
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("SMTP_FROM_EMAIL", self.smtp_user)
        self.from_name = os.getenv("SMTP_FROM_NAME", "Arsenal Ops")
    
    def is_configured(self) -> bool:
        """Check if SMTP is properly configured"""
        return bool(self.smtp_user and self.smtp_password)
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None
    ) -> bool:
        """
        Send an email via SMTP
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_body: HTML email body
            text_body: Plain text fallback (optional)
        
        Returns:
            True if successful, False otherwise
        """
        if not self.is_configured():
            logger.warning(f"SMTP not configured. Would send email to {to_email}")
            return False
        
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            if text_body:
                text_part = MIMEText(text_body, 'plain')
                msg.attach(text_part)
            
            html_part = MIMEText(html_body, 'html')
            msg.attach(html_part)
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())
            
            logger.info(f"Email sent to {to_email} with subject: {subject}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False
    
    def send_task_assignment_notification(
        self,
        to_email: str,
        to_name: str,
        assigner_name: str,
        work_item_key: str,
        work_item_title: str,
        work_item_description: str,
        project_id: int,
        work_item_id: int,
        priority: str = "medium",
        due_date: Optional[str] = None
    ) -> bool:
        """Send notification when a task is assigned to someone"""
        frontend_url = os.getenv("FRONTEND_URL", "https://arsenal-ops.vercel.app")
        ticket_link = f"{frontend_url}/project/{project_id}/board/{work_item_id}"
        
        priority_color = {
            "critical": "#DC2626",
            "high": "#F97316",
            "medium": "#6366F1",
            "low": "#10B981"
        }.get(priority, "#6366F1")
        
        priority_emoji = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🟢"
        }.get(priority, "🟡")
        
        html_body = f"""
        <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); margin-top: 20px;">
                <div style="border-left: 4px solid {priority_color}; padding-left: 20px; margin-bottom: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 10px 0; font-size: 24px;">
                        {priority_emoji} Task Assignment
                    </h2>
                    <p style="color: #6b7280; margin: 0; font-size: 14px;">
                        You have been assigned a new task
                    </p>
                </div>
                
                <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                        <strong>{work_item_key}</strong> • Priority: <span style="color: {priority_color}; font-weight: bold;">{priority.upper()}</span>
                    </p>
                    <h3 style="margin: 10px 0; color: #1f2937; font-size: 18px;">
                        {work_item_title}
                    </h3>
                    <p style="margin: 10px 0 0 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                        {work_item_description}
                    </p>
                    {f'<p style="margin: 15px 0 0 0; color: #6b7280; font-size: 13px;"><strong>Due Date:</strong> {due_date}</p>' if due_date else ''}
                </div>
                
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                    <p style="margin: 0; color: #1e40af; font-size: 14px;">
                        <strong>{assigner_name}</strong> assigned you this task
                    </p>
                </div>
                
                <div style="margin-top: 30px; text-align: center;">
                    <a href="{ticket_link}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-bottom: 20px;">View Ticket</a>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        This is an automated notification from <strong>Arsenal Ops</strong>. 
                        Log in to view and manage your tasks.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
Task Assignment

You have been assigned a new task: {work_item_key}

Title: {work_item_title}

Description: {work_item_description}

Priority: {priority.upper()}
{"Due Date: " + due_date if due_date else ""}

Assigned by: {assigner_name}

View Ticket: {ticket_link}

Log in to Arsenal Ops to view and manage your tasks.
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"📋 Task Assignment: {work_item_key} - {work_item_title}",
            html_body=html_body,
            text_body=text_body
        )
    
    def send_mention_notification(
        self,
        to_email: str,
        to_name: str,
        author_name: str,
        work_item_key: str,
        work_item_title: str,
        comment_content: str,
        project_id: int,
        work_item_id: int,
        is_blocker: bool = False
    ) -> bool:
        """Send notification when user is mentioned in a comment"""
        frontend_url = os.getenv("FRONTEND_URL", "https://arsenal-ops.vercel.app")
        ticket_link = f"{frontend_url}/project/{project_id}/board/{work_item_id}"
        
        color = "#DC2626" if is_blocker else "#6366F1"
        emoji = "🚫" if is_blocker else "💬"
        notification_type = "BLOCKER Alert" if is_blocker else "Mention"
        
        html_body = f"""
        <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); margin-top: 20px;">
                <div style="border-left: 4px solid {color}; padding-left: 20px; margin-bottom: 30px;">
                    <h2 style="color: {'#7f1d1d' if is_blocker else '#1f2937'}; margin: 0 0 10px 0; font-size: 24px;">
                        {emoji} {notification_type}
                    </h2>
                    <p style="color: #6b7280; margin: 0; font-size: 14px;">
                        {'You were mentioned in a blocking issue' if is_blocker else 'You were mentioned in a comment'}
                    </p>
                </div>
                
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                    Hi <strong>{to_name}</strong>,
                </p>
                
                <p style="color: #374151; font-size: 16px; margin: 20px 0;">
                    <strong>{author_name}</strong> mentioned you in <strong>{work_item_key}</strong>
                </p>
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid {color};">
                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                        <strong>{work_item_key}</strong>
                    </p>
                    <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: bold;">
                        {work_item_title}
                    </p>
                    <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 10px; border: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #374151; font-size: 14px; white-space: pre-wrap; line-height: 1.6;">
                            {comment_content}
                        </p>
                    </div>
                </div>
                
                {'<p style="color: #991b1b; background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; font-weight: bold;">⚠️ This comment is marked as a BLOCKER and requires your attention!</p>' if is_blocker else ''}
                
                <div style="margin-top: 30px; text-align: center;">
                    <a href="{ticket_link}" style="display: inline-block; background-color: {color}; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-bottom: 20px;">View Ticket</a>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        This is an automated notification from <strong>Arsenal Ops</strong>. 
                        Log in to respond or view more details.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
{notification_type}

Hi {to_name},

{author_name} mentioned you in {work_item_key}:

{work_item_title}

Comment:
{comment_content}

{'⚠️ This comment is marked as a BLOCKER and requires your attention!' if is_blocker else ''}

View Ticket: {ticket_link}

Log in to Arsenal Ops to respond or view more details.
        """
        
        subject_prefix = "🚫 BLOCKER:" if is_blocker else "💬"
        return self.send_email(
            to_email=to_email,
            subject=f"{subject_prefix} You were mentioned in {work_item_key}",
            html_body=html_body,
            text_body=text_body
        )


    def send_status_change_notification(
        self,
        to_email: str,
        to_name: str,
        changed_by: str,
        work_item_key: str,
        work_item_title: str,
        old_status: str,
        new_status: str,
        project_id: int,
        work_item_id: int,
        role: str = "assignee"
    ) -> bool:
        """Send notification when a ticket's status changes"""
        frontend_url = os.getenv("FRONTEND_URL", "https://arsenal-ops.vercel.app")
        ticket_link = f"{frontend_url}/project/{project_id}/board/{work_item_id}"
        
        status_colors = {
            "backlog": "#9CA3AF",
            "todo": "#6B7280",
            "in_progress": "#3B82F6",
            "in_review": "#F59E0B",
            "done": "#10B981"
        }
        status_labels = {
            "backlog": "Backlog",
            "todo": "To Do",
            "in_progress": "In Progress",
            "in_review": "In Review",
            "done": "Done"
        }
        
        old_color = status_colors.get(old_status, "#6B7280")
        new_color = status_colors.get(new_status, "#6B7280")
        old_label = status_labels.get(old_status, old_status)
        new_label = status_labels.get(new_status, new_status)
        
        role_text = "You are the assignee" if role == "assignee" else "You are the creator"
        
        html_body = f"""
        <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); margin-top: 20px;">
                <div style="border-left: 4px solid {new_color}; padding-left: 20px; margin-bottom: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 10px 0; font-size: 24px;">
                        Status Updated
                    </h2>
                    <p style="color: #6b7280; margin: 0; font-size: 14px;">
                        {role_text} of this ticket
                    </p>
                </div>
                
                <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                        <strong>{work_item_key}</strong>
                    </p>
                    <h3 style="margin: 10px 0; color: #1f2937; font-size: 18px;">
                        {work_item_title}
                    </h3>
                    <div style="display: flex; align-items: center; margin-top: 15px;">
                        <span style="background: {old_color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                            {old_label}
                        </span>
                        <span style="margin: 0 10px; color: #9CA3AF; font-size: 18px;">&rarr;</span>
                        <span style="background: {new_color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                            {new_label}
                        </span>
                    </div>
                </div>
                
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                    <p style="margin: 0; color: #1e40af; font-size: 14px;">
                        <strong>{changed_by}</strong> changed the status
                    </p>
                </div>
                
                <div style="margin-top: 30px; text-align: center;">
                    <a href="{ticket_link}" style="display: inline-block; background-color: {new_color}; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-bottom: 20px;">View Ticket</a>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        This is an automated notification from <strong>Arsenal Ops</strong>. 
                        Log in to view and manage your tasks.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
Status Update

Ticket {work_item_key}: {work_item_title}

Status changed: {old_label} → {new_label}
Changed by: {changed_by}
{role_text} of this ticket.

View Ticket: {ticket_link}

Log in to Arsenal Ops to view and manage your tasks.
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"Status Update: {work_item_key} — {old_label} → {new_label}",
            html_body=html_body,
            text_body=text_body
        )


# Create a singleton instance
email_service = EmailService()
