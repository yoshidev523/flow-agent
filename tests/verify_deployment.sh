#!/bin/sh
set -eu
flow_source_dir="$(pwd)"
flow_verify_root="$(mktemp -d)"
flow_fixture_dir="$flow_verify_root/fixture"
flow_consumer_dir="$flow_verify_root/consumer"
printf 'Deployment verification directory: %s\n' "$flow_verify_root"
(
  cd "$flow_verify_root"
  apm init fixture --yes --target claude,codex
  apm init consumer --yes --target claude,codex
  cp -R "$flow_source_dir/.apm" "$flow_fixture_dir/.apm"
)
(
  cd "$flow_consumer_dir"
  apm install "$flow_fixture_dir" --target claude,codex
  apm compile --validate --target claude,codex
)
for skill_name in flow flow-artifact-sync flow-design flow-plan flow-implement \
  flow-design-review flow-design-review-requirements flow-design-review-quality-risk \
  flow-plan-decision-review flow-plan-review-decision-quality flow-plan-review flow-plan-review-task-readiness
do
  test -f "$flow_consumer_dir/.agents/skills/$skill_name/SKILL.md"
  test -f "$flow_consumer_dir/.agents/skills/$skill_name/agents/openai.yaml"
  rg -q 'allow_implicit_invocation: false' "$flow_consumer_dir/.agents/skills/$skill_name/agents/openai.yaml"
  test -f "$flow_consumer_dir/.claude/skills/$skill_name/SKILL.md"
done
for agent_name in flow-designer flow-planner flow-implementer flow-design-reviewer \
  flow-design-requirements-reviewer flow-design-quality-risk-reviewer \
  flow-plan-decision-reviewer flow-plan-decision-quality-reviewer flow-plan-reviewer flow-plan-task-readiness-reviewer
do
  test -f "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  test -f "$flow_consumer_dir/.claude/agents/$agent_name.md"
done
for removed_skill in flow-design-review-user-value flow-plan-review-structure-integration \
  flow-plan-review-executability flow-plan-review-verifiability
do
  test ! -e "$flow_consumer_dir/.agents/skills/$removed_skill"
  test ! -e "$flow_consumer_dir/.claude/skills/$removed_skill"
done
for removed_agent in flow-design-user-value-reviewer flow-plan-structure-integration-reviewer \
  flow-plan-executability-reviewer flow-plan-verifiability-reviewer
do
  test ! -e "$flow_consumer_dir/.codex/agents/$removed_agent.toml"
  test ! -e "$flow_consumer_dir/.claude/agents/$removed_agent.md"
done
! rg -q 'model_reasoning_effort|nickname_candidates' "$flow_consumer_dir/.codex/agents"
for skill_root in .agents .claude
do
  cmp "$flow_source_dir/.apm/skills/flow-artifact-sync/scripts/flowctl.js" "$flow_consumer_dir/$skill_root/skills/flow-artifact-sync/scripts/flowctl.js"
  cmp "$flow_source_dir/.apm/skills/flow-artifact-sync/references/contracts.md" "$flow_consumer_dir/$skill_root/skills/flow-artifact-sync/references/contracts.md"
  test -f "$flow_consumer_dir/$skill_root/skills/flow-artifact-sync/assets/templates/implement.md"
  flow_sync_only_dir="$flow_verify_root/sync-only-$skill_root"
  mkdir -p "$flow_sync_only_dir"
  cp -R "$flow_consumer_dir/$skill_root/skills/flow-artifact-sync" "$flow_sync_only_dir/flow-artifact-sync"
  node "$flow_sync_only_dir/flow-artifact-sync/scripts/flowctl.js" --help >/dev/null
  cmp "$flow_source_dir/.apm/skills/flow/scripts/flowctl.js" "$flow_consumer_dir/$skill_root/skills/flow/scripts/flowctl.js"
  cmp "$flow_source_dir/.apm/skills/flow/references/contracts.md" "$flow_consumer_dir/$skill_root/skills/flow/references/contracts.md"
  test ! -e "$flow_consumer_dir/$skill_root/skills/flow/references/contracts.schema.json"
  test -f "$flow_consumer_dir/$skill_root/skills/flow/assets/templates/design.md"
  flow_node_only_dir="$flow_verify_root/node-only-$skill_root"
  mkdir -p "$flow_node_only_dir"
  cp "$flow_consumer_dir/$skill_root/skills/flow/scripts/flowctl.js" "$flow_node_only_dir/flowctl.js"
  node "$flow_node_only_dir/flowctl.js" --help >/dev/null
  printf '%s' '{"request_id":"init","feature_id":"deployment","run_id":"run-001","text":"Node only"}' |
    node "$flow_node_only_dir/flowctl.js" --root "$flow_node_only_dir/feature" init --request - >/dev/null
  node "$flow_node_only_dir/flowctl.js" --root "$flow_node_only_dir/feature" resume-check >/dev/null
  test ! -e "$flow_node_only_dir/node_modules"
  test ! -e "$flow_node_only_dir/contracts.schema.json"
done
printf 'Deployment verification passed; retained %s\n' "$flow_verify_root"
