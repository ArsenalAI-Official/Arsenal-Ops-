"""WorkforceClient model — local cache of QuickBooks Customers.

The per-project client picker reads from this table instead of hitting
Intuit on every render. A refresh job (Saturday cron, OAuth connect, or
the manual "Refresh clients" button) keeps it in sync.

Refresh semantics:
- New QB customers → INSERT with `active=True`
- Existing customers (matched by `qb_customer_id`) → UPDATE name; clear
  `active=False` if it was previously inactive (QB re-activated)
- Customers no longer returned by QB → mark `active=False` (soft delete)
  so a project still tagged to them surfaces the staleness instead of
  appearing fine

`active` is the picker's filter: only `active=True` rows show up in the
project-link dropdown. Inactive rows linger so we can warn "this
project is tagged to a customer that no longer exists in QB" later
without needing audit logs.
"""

import sys
from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

sys.path.append("..")
from database import Base


class WorkforceClient(Base):
    __tablename__ = "workforce_clients"

    # Composite primary key — QB customer ids are only unique WITHIN a
    # realm (Intuit hands out small ints starting from 1, so two realms
    # both have a customer "5"). A single-column PK on qb_customer_id
    # would treat those as the same row, silently merging two realms'
    # customers if a cross-realm cleanup ever fails partway. The realm
    # is part of the identity, not just a filter column.
    qb_customer_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    realm_id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)

    # Cached display name. Refreshed on every successful refresh; powers
    # the picker dropdown without a QB round-trip.
    name: Mapped[str] = mapped_column(String(255))

    # Soft-delete flag. False means QB returned this customer at one
    # point but no longer does (deactivated or deleted in QB). The
    # picker filters these out; the project chip can still show the
    # cached name on already-tagged projects.
    active: Mapped[bool] = mapped_column(default=True, index=True)

    # Updated on every refresh that observes this customer. Doubles as
    # the freshness signal (latest `last_synced_at` across all rows in
    # a realm = when the cache was last refreshed) so we don't need a
    # separate "last refresh time" record.
    last_synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        # Picker queries always filter by `active=True` and sort by `name`.
        Index("idx_workforce_clients_active_name", "active", "name"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.qb_customer_id,
            "name": self.name,
            "active": self.active,
            "last_synced_at": (
                self.last_synced_at.isoformat() + "Z" if self.last_synced_at else None
            ),
        }
