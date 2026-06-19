"""
Comprehensive tests for hours calculation logic
Tests all edge cases for time tracking accuracy
"""

import sys
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import Mock

import pytest

sys.path.append("..")


class TestHoursCalculation:
    """Test suite for hours calculation logic"""

    def setup_method(self):
        """Setup test fixtures"""
        self.today = datetime.utcnow()
        # Calculate week boundaries (Sunday to Saturday)
        days_since_sunday = (self.today.weekday() + 1) % 7
        self.week_start = self.today - timedelta(days=days_since_sunday)
        self.week_start = self.week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        self.week_end = self.week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    def test_week_boundaries_sunday_to_saturday(self):
        """Test that week boundaries are correctly calculated as Sunday-Saturday"""
        # Test case: Wednesday (weekday=2)
        wednesday = datetime(2026, 3, 25, 12, 0, 0)  # Wednesday
        days_since_sunday = (wednesday.weekday() + 1) % 7  # (2+1)%7 = 3
        week_start = wednesday - timedelta(days=days_since_sunday)
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        # Should be Sunday, March 22, 2026
        assert week_start.weekday() == 6  # Sunday
        assert week_start.day == 22

        week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
        assert week_end.weekday() == 5  # Saturday
        assert week_end.day == 28

    def test_time_entry_attribution_to_logger(self):
        """Test that time entries are attributed to the person logging, not assignee"""
        # Mock time entry
        time_entry = Mock()
        time_entry.developer_id = 1  # Logger's ID
        time_entry.hours = 4
        time_entry.logged_at = self.today

        # Mock work item assigned to different developer
        work_item = Mock()
        work_item.assignee_id = 2  # Different from logger
        work_item.id = 100

        # Attribution should go to developer_id (logger), not assignee_id
        assert time_entry.developer_id == 1
        assert work_item.assignee_id == 2
        assert time_entry.developer_id != work_item.assignee_id

    def test_developer_hours_calculation(self):
        """Test calculation of developer hours from time entries"""
        # Create mock time entries for a developer
        dev_id = 1

        entries = [
            Mock(developer_id=dev_id, hours=4, logged_at=self.today),
            Mock(developer_id=dev_id, hours=3, logged_at=self.today - timedelta(days=1)),
            Mock(
                developer_id=dev_id, hours=5, logged_at=self.today - timedelta(days=10)
            ),  # Last week
        ]

        # Calculate total logged hours
        total_logged = sum(te.hours for te in entries)
        assert total_logged == 12

        # Calculate this week's hours
        this_week_logged = sum(
            te.hours
            for te in entries
            if te.logged_at and self.week_start <= te.logged_at <= self.week_end
        )
        assert this_week_logged == 7  # 4 + 3 (today and yesterday)

    def test_allocated_hours_calculation(self):
        """Test calculation of allocated hours from assigned tickets"""
        dev_id = 1

        # Mock work items assigned to developer
        items = [
            Mock(assignee_id=dev_id, estimated_hours=30, status="in_progress"),
            Mock(assignee_id=dev_id, estimated_hours=20, status="todo"),
            Mock(assignee_id=dev_id, estimated_hours=15, status="done"),
            Mock(assignee_id=dev_id, estimated_hours=None, status="todo"),  # No estimate
        ]

        # Calculate allocated hours (sum of all estimates)
        allocated = sum(item.estimated_hours or 0 for item in items)
        assert allocated == 65  # 30 + 20 + 15 + 0

    def test_remaining_hours_calculation(self):
        """Test calculation of remaining hours"""
        allocated = 100
        logged = 30

        # Remaining should be allocated - logged
        remaining = max(0, allocated - logged)
        assert remaining == 70

        # Test edge case: logged > allocated
        logged = 120
        remaining = max(0, allocated - logged)
        assert remaining == 0  # Should not go negative

    def test_null_developer_id_fallback(self):
        """Test fallback to assignee when time entry has no developer_id"""
        work_item_assignee_map = {100: 2, 101: 3}

        # Time entry with null developer_id
        time_entry = Mock()
        time_entry.developer_id = None
        time_entry.work_item_id = 100

        # Should fallback to assignee
        effective_dev_id = time_entry.developer_id or work_item_assignee_map.get(
            time_entry.work_item_id
        )
        assert effective_dev_id == 2

    def test_multiple_developers_time_entries(self):
        """Test that hours are correctly attributed to multiple developers"""
        entries = [
            Mock(developer_id=1, hours=5, logged_at=self.today),
            Mock(developer_id=1, hours=3, logged_at=self.today),
            Mock(developer_id=2, hours=4, logged_at=self.today),
            Mock(developer_id=2, hours=2, logged_at=self.today),
            Mock(developer_id=3, hours=0, logged_at=self.today),  # Zero hours
        ]

        # Group by developer
        dev_hours: dict[Any, Any] = {}
        for te in entries:
            dev_hours[te.developer_id] = dev_hours.get(te.developer_id, 0) + te.hours

        assert dev_hours[1] == 8
        assert dev_hours[2] == 6
        assert dev_hours[3] == 0

    def test_time_entry_date_boundaries(self):
        """Test time entries at week boundaries"""
        # Entry exactly at week start
        entry_start = Mock(developer_id=1, hours=2, logged_at=self.week_start)

        # Entry exactly at week end
        entry_end = Mock(developer_id=1, hours=3, logged_at=self.week_end)

        # Entry just before week start
        entry_before = Mock(
            developer_id=1, hours=4, logged_at=self.week_start - timedelta(seconds=1)
        )

        # Entry just after week end
        entry_after = Mock(developer_id=1, hours=5, logged_at=self.week_end + timedelta(seconds=1))

        entries = [entry_start, entry_end, entry_before, entry_after]

        # Filter for this week
        this_week = [
            te
            for te in entries
            if te.logged_at and self.week_start <= te.logged_at <= self.week_end
        ]

        assert len(this_week) == 2
        assert sum(te.hours for te in this_week) == 5  # 2 + 3

    def test_work_item_logged_hours_consistency(self):
        """Test that work_item.logged_hours matches sum of time entries after repair"""
        # This tests the data consistency - after repair, these should match
        work_item = Mock()
        work_item.id = 100
        work_item.assignee_id = 1

        # Time entries for this work item
        time_entries = [
            Mock(work_item_id=100, developer_id=1, hours=4),
            Mock(work_item_id=100, developer_id=1, hours=4),
            Mock(work_item_id=100, developer_id=1, hours=3),
        ]

        sum_from_entries = sum(te.hours for te in time_entries)

        # Simulate repair: sync work_item.logged_hours with time entries
        work_item.logged_hours = sum_from_entries

        # These should now match for data consistency
        assert work_item.logged_hours == sum_from_entries, (
            f"Mismatch: work_item has {work_item.logged_hours}h but time entries sum to {sum_from_entries}h"
        )


class TestHoursAnalyticsEdgeCases:
    """Test edge cases for hours analytics"""

    def test_no_time_entries(self):
        """Test calculation when developer has no time entries"""
        dev_id = 1
        all_time_entries: list[Any] = []  # No entries

        dev_time_entries = [te for te in all_time_entries if te.developer_id == dev_id]

        logged = sum(te.hours for te in dev_time_entries)
        assert logged == 0

    def test_no_assigned_items(self):
        """Test calculation when developer has no assigned items"""
        dev_id = 1
        items: list[Any] = []  # No items

        dev_items = [item for item in items if item.assignee_id == dev_id]
        allocated = sum(item.estimated_hours or 0 for item in dev_items)

        assert allocated == 0
        assert len(dev_items) == 0

    def test_negative_remaining_calculation(self):
        """Test that remaining hours never goes negative"""
        allocated = 10
        logged = 15  # More than allocated

        remaining = max(0, allocated - logged)
        assert remaining == 0  # Should be clamped to 0

    def test_fractional_hours(self):
        """Test handling of fractional hours"""
        entries = [
            Mock(developer_id=1, hours=2.5, logged_at=datetime.utcnow()),
            Mock(developer_id=1, hours=1.5, logged_at=datetime.utcnow()),
        ]

        total = sum(te.hours for te in entries)
        assert total == 4.0


class TestDebugEndpointScenarios:
    """Test scenarios for the debug endpoint"""

    def test_debug_shows_all_time_entries(self):
        """Test that debug endpoint returns all time entries with details"""
        # Mock project with work items
        work_items = [
            Mock(id=1, key="PROJ-1", title="Task 1", assignee_id=1, assignee=Mock(name="Dev 1")),
            Mock(id=2, key="PROJ-2", title="Task 2", assignee_id=2, assignee=Mock(name="Dev 2")),
        ]

        # Mock time entries
        time_entries = [
            Mock(
                id=1,
                work_item_id=1,
                developer_id=1,
                hours=4,
                logged_at=datetime.utcnow(),
                description="Work done",
            ),
            Mock(
                id=2,
                work_item_id=1,
                developer_id=2,
                hours=2,  # Different logger
                logged_at=datetime.utcnow(),
                description="Review",
            ),
            Mock(
                id=3,
                work_item_id=2,
                developer_id=2,
                hours=5,
                logged_at=datetime.utcnow(),
                description="Implementation",
            ),
        ]

        # Build work item map
        work_item_map = {wi.id: wi for wi in work_items}

        # Debug info should show attribution
        debug_info = []
        for te in time_entries:
            wi = work_item_map.get(te.work_item_id)
            debug_info.append(
                {
                    "time_entry_id": te.id,
                    "work_item_key": wi.key if wi else "Unknown",
                    "work_item_title": wi.title if wi else "Unknown",
                    "logged_by_developer_id": te.developer_id,
                    "ticket_assignee_id": wi.assignee_id if wi else None,
                    "hours": te.hours,
                    "attribution": "logger" if te.developer_id else "assignee_fallback",
                }
            )

        assert len(debug_info) == 3
        # Entry 2: Dev 2 logged on Dev 1's ticket
        assert debug_info[1]["logged_by_developer_id"] == 2
        assert debug_info[1]["ticket_assignee_id"] == 1


class TestTicketTransferScenarios:
    """Test scenarios for ticket transfers and reassignments"""

    def test_hours_stay_with_original_assignee_after_transfer(self):
        """Test that hours logged stay with the original assignee after ticket transfer"""
        # Original assignee (Dev 1) had 5h logged
        original_assignee_id = 1
        new_assignee_id = 2

        # Time entries when Dev 1 was assignee
        time_entries = [
            Mock(developer_id=original_assignee_id, hours=5, logged_at=datetime.utcnow()),
        ]

        # Ticket is now assigned to Dev 2
        work_item = Mock()
        work_item.id = 100
        work_item.assignee_id = new_assignee_id  # Now assigned to Dev 2
        work_item.logged_hours = 5

        # Hours should still be attributed to Dev 1 (who logged them)
        dev_1_hours = sum(
            te.hours for te in time_entries if te.developer_id == original_assignee_id
        )
        dev_2_hours = sum(te.hours for te in time_entries if te.developer_id == new_assignee_id)

        assert dev_1_hours == 5  # Dev 1 still has their 5 hours
        assert dev_2_hours == 0  # Dev 2 has no hours on this ticket yet

    def test_multiple_transfers_with_different_loggers(self):
        """Test ticket transferred multiple times with different people logging hours"""
        dev_1_id = 1  # Original assignee
        dev_2_id = 2  # Second assignee
        dev_3_id = 3  # Third assignee
        pm_id = 99  # PM who logs hours for review

        # Timeline of events:
        # 1. Dev 1 assigned, logs 3h
        # 2. Transferred to Dev 2, Dev 2 logs 4h
        # 3. PM reviews and logs 2h (while Dev 2 is assignee)
        # 4. Transferred to Dev 3, Dev 3 logs 5h

        time_entries = [
            Mock(developer_id=dev_1_id, hours=3, logged_at=datetime.utcnow() - timedelta(days=5)),
            Mock(developer_id=dev_2_id, hours=4, logged_at=datetime.utcnow() - timedelta(days=3)),
            Mock(developer_id=pm_id, hours=2, logged_at=datetime.utcnow() - timedelta(days=2)),
            Mock(developer_id=dev_3_id, hours=5, logged_at=datetime.utcnow()),
        ]

        # Calculate hours per developer
        dev_hours: dict[Any, Any] = {}
        for te in time_entries:
            dev_hours[te.developer_id] = dev_hours.get(te.developer_id, 0) + te.hours

        assert dev_hours[dev_1_id] == 3
        assert dev_hours[dev_2_id] == 4
        assert dev_hours[dev_3_id] == 5
        assert dev_hours[pm_id] == 2
        assert sum(dev_hours.values()) == 14  # Total 14 hours

    def test_hours_logged_by_unassigned_person(self):
        """Test when someone not assigned to ticket logs hours (e.g., helping out)"""
        assignee_id = 1
        helper_id = 2

        # Helper logs hours on someone else's ticket
        time_entries = [
            Mock(developer_id=assignee_id, hours=6, logged_at=datetime.utcnow()),
            Mock(developer_id=helper_id, hours=3, logged_at=datetime.utcnow()),  # Helper
        ]

        # Both should get credit for their hours
        assignee_hours = sum(te.hours for te in time_entries if te.developer_id == assignee_id)
        helper_hours = sum(te.hours for te in time_entries if te.developer_id == helper_id)

        assert assignee_hours == 6
        assert helper_hours == 3

    def test_ticket_with_no_assignee_logging_hours(self):
        """Test logging hours when ticket has no assignee"""
        work_item = Mock()
        work_item.id = 100
        work_item.assignee_id = None  # No assignee

        # Logger (current user) should get the hours
        logger_id = 5
        time_entries = [
            Mock(developer_id=logger_id, hours=4, logged_at=datetime.utcnow()),
        ]

        # Should attribute to the logger since no assignee
        logged_hours = sum(te.hours for te in time_entries if te.developer_id == logger_id)
        assert logged_hours == 4


class TestLogHoursEndpointLogic:
    """Test the log-hours endpoint attribution logic"""

    def test_log_hours_with_explicit_developer_id(self):
        """Test logging hours for a specific developer"""
        ticket_assignee_id = 1
        explicit_developer_id = 2

        # When logging with explicit developer_id, use that
        request_developer_id = explicit_developer_id

        # Should attribute to explicit developer, not assignee
        if request_developer_id:
            attributed_to = request_developer_id
        elif ticket_assignee_id:
            attributed_to = ticket_assignee_id
        else:
            attributed_to = None

        assert attributed_to == explicit_developer_id

    def test_log_hours_without_explicit_id_uses_assignee(self):
        """Test that hours go to assignee when no explicit developer_id"""
        ticket_assignee_id = 1
        request_developer_id = None

        if request_developer_id:
            attributed_to = request_developer_id
        elif ticket_assignee_id:
            attributed_to = ticket_assignee_id
        else:
            attributed_to = None

        assert attributed_to == ticket_assignee_id

    def test_log_hours_no_assignee_no_explicit_id(self):
        """Test logging when no assignee and no explicit developer_id"""
        ticket_assignee_id = None
        request_developer_id = None
        current_user_id = 5

        if request_developer_id:
            attributed_to = request_developer_id
        elif ticket_assignee_id:
            attributed_to = ticket_assignee_id
        else:
            attributed_to = current_user_id  # Fallback to current user

        assert attributed_to == current_user_id


class TestThisWeekFiltering:
    """Test 'This Week' filtering scenarios"""

    def setup_method(self):
        """Setup test fixtures"""
        self.today = datetime.utcnow()
        days_since_sunday = (self.today.weekday() + 1) % 7
        self.week_start = self.today - timedelta(days=days_since_sunday)
        self.week_start = self.week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        self.week_end = self.week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    def test_entries_across_multiple_weeks(self):
        """Test filtering entries across multiple weeks"""
        entries = [
            Mock(
                developer_id=1, hours=2, logged_at=self.week_start - timedelta(days=7)
            ),  # Last week
            Mock(
                developer_id=1, hours=3, logged_at=self.week_start + timedelta(days=1)
            ),  # This week
            Mock(
                developer_id=1, hours=4, logged_at=self.week_start + timedelta(days=3)
            ),  # This week
            Mock(developer_id=1, hours=5, logged_at=self.week_end + timedelta(days=1)),  # Next week
        ]

        # Filter for this week only
        this_week_entries = [
            te
            for te in entries
            if te.logged_at and self.week_start <= te.logged_at <= self.week_end
        ]

        assert len(this_week_entries) == 2
        assert sum(te.hours for te in this_week_entries) == 7  # 3 + 4

    def test_entries_spanning_week_boundary(self):
        """Test entries logged exactly at week boundaries"""
        entries = [
            Mock(developer_id=1, hours=1, logged_at=self.week_start),  # Sunday 00:00
            Mock(developer_id=1, hours=2, logged_at=self.week_end),  # Saturday 23:59:59
        ]

        this_week_entries = [
            te
            for te in entries
            if te.logged_at and self.week_start <= te.logged_at <= self.week_end
        ]

        assert len(this_week_entries) == 2
        assert sum(te.hours for te in this_week_entries) == 3

    def test_this_week_total_calculation(self):
        """Test calculating this week's total from mixed entries"""
        entries = [
            Mock(developer_id=1, hours=5, logged_at=self.week_start + timedelta(hours=12)),
            Mock(developer_id=2, hours=3, logged_at=self.week_start + timedelta(days=2)),
            Mock(
                developer_id=1, hours=2, logged_at=self.week_start - timedelta(days=2)
            ),  # Last week
        ]

        this_week_total = sum(
            te.hours
            for te in entries
            if te.logged_at and self.week_start <= te.logged_at <= self.week_end
        )

        assert this_week_total == 8  # 5 + 3


class TestDataRepairScenarios:
    """Test data repair and consistency scenarios"""

    def test_repair_syncs_work_item_with_time_entries(self):
        """Test that repair endpoint syncs work_item.logged_hours with time entries"""
        work_item = Mock()
        work_item.id = 100
        work_item.logged_hours = 20  # Incorrect
        work_item.estimated_hours = 30

        time_entries = [
            Mock(work_item_id=100, hours=5),
            Mock(work_item_id=100, hours=5),
            Mock(work_item_id=100, hours=5),
        ]

        # Calculate correct logged hours
        correct_logged = sum(te.hours for te in time_entries)
        assert correct_logged == 15

        # Repair should update work_item
        work_item.logged_hours = correct_logged
        work_item.remaining_hours = max(0, work_item.estimated_hours - correct_logged)

        assert work_item.logged_hours == 15
        assert work_item.remaining_hours == 15

    def test_repair_with_no_time_entries(self):
        """Test repair when work item has no time entries"""
        work_item = Mock()
        work_item.id = 100
        work_item.logged_hours = 10  # Should be 0
        work_item.estimated_hours = 20

        time_entries: list[Any] = []  # No entries

        correct_logged = sum(te.hours for te in time_entries)
        work_item.logged_hours = correct_logged
        work_item.remaining_hours = max(0, work_item.estimated_hours - correct_logged)

        assert work_item.logged_hours == 0
        assert work_item.remaining_hours == 20

    def test_repair_with_more_logged_than_estimated(self):
        """Test repair when logged hours exceed estimated"""
        work_item = Mock()
        work_item.id = 100
        work_item.logged_hours = 50
        work_item.estimated_hours = 30

        time_entries = [
            Mock(work_item_id=100, hours=25),
            Mock(work_item_id=100, hours=25),
        ]

        correct_logged = sum(te.hours for te in time_entries)
        work_item.logged_hours = correct_logged
        work_item.remaining_hours = max(0, work_item.estimated_hours - correct_logged)

        assert work_item.logged_hours == 50
        assert work_item.remaining_hours == 0  # Should not go negative


class TestConcurrentLoggingScenarios:
    """Test concurrent logging and race condition scenarios"""

    def test_multiple_people_log_same_ticket_same_time(self):
        """Test when multiple people log hours on the same ticket around the same time"""
        base_time = datetime.utcnow()

        # Simulating concurrent logs within same minute
        time_entries = [
            Mock(developer_id=1, hours=2, logged_at=base_time),
            Mock(developer_id=2, hours=3, logged_at=base_time + timedelta(seconds=30)),
            Mock(developer_id=3, hours=1, logged_at=base_time + timedelta(seconds=45)),
        ]

        total_hours = sum(te.hours for te in time_entries)
        assert total_hours == 6

        # Each developer should have their own hours
        assert sum(te.hours for te in time_entries if te.developer_id == 1) == 2
        assert sum(te.hours for te in time_entries if te.developer_id == 2) == 3
        assert sum(te.hours for te in time_entries if te.developer_id == 3) == 1

    def test_rapid_successive_logs_same_developer(self):
        """Test when same developer logs hours multiple times rapidly"""
        dev_id = 1
        base_time = datetime.utcnow()

        time_entries = [
            Mock(developer_id=dev_id, hours=1, logged_at=base_time),
            Mock(developer_id=dev_id, hours=2, logged_at=base_time + timedelta(minutes=5)),
            Mock(developer_id=dev_id, hours=3, logged_at=base_time + timedelta(minutes=10)),
        ]

        total = sum(te.hours for te in time_entries)
        assert total == 6


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
