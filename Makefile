# Makefile — delegates to scripts/ci.mjs for local CI validation
#
# Usage: make ci [TARGET=ci]
#   make ci           # Run full validation suite (default target)
#   make ci TARGET=api       # API only
#   make ci TARGET=react     # React Admin only
#   make ci TARGET=flutter   # Flutter POS only
#   make ci TARGET=containers # Container images only
#   make ci TARGET=backup    # Backups only
#   make ci TARGET=monitoring # Monitoring only
#   make ci TARGET=dependency-audit # Dependency audit only
#   make ci TARGET=e2e-admin # React Admin E2E only
#   make ci TARGET=e2e-pos   # Flutter POS E2E (legacy) only
#   make ci TARGET=e2e-patrol # Flutter POS Patrol Web only

.PHONY: ci

TARGET ?= ci

ci:
	node scripts/ci.mjs $(TARGET)

# Convenience targets
api:
	node scripts/ci.mjs api

react:
	node scripts/ci.mjs react

flutter:
	node scripts/ci.mjs flutter

containers:
	node scripts/ci.mjs containers

backup:
	node scripts/ci.mjs backup

monitoring:
	node scripts/ci.mjs monitoring

dependency-audit:
	node scripts/ci.mjs dependency-audit

e2e-admin:
	node scripts/ci.mjs e2e-admin

e2e-pos:
	node scripts/ci.mjs e2e-pos

e2e-patrol:
	node scripts/ci.mjs e2e-patrol