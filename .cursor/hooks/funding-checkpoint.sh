#!/bin/bash
# Remind the agent when the funding-proposal window opens.
# Checkpoint date lives in docs/OUTREACH_WAVE1.md.
now=$(date +%Y%m%d)
if [ "$now" -ge 20261124 ]; then
  printf '%s\n' '{"additional_context":"Funding checkpoint (24 Nov 2026+): tell Terence it may be time to start the NOC Careers proposal process. Only proceed if all three are true: (1) at least one Wave 1 written yes plus a list-change contact, (2) an eligible lead applicant (Community Futures / EDO / settlement agency), (3) 8–12 weeks of clean outbound clicks to official portals. See docs/OUTREACH_WAVE1.md. Do not ask partners for money until those gates are met."}'
else
  printf '%s\n' '{}'
fi
