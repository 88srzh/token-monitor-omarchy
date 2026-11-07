'use strict';

// OpenCode Go's per-model monthly allowances.
//
// The public usage endpoint (`/zen/go/v1/usage`) answers only the aggregate
// rolling, weekly and monthly percentages. The Console's usage-by-model table
// is the only per-model reading, and the allowance behind each model is not in
// any API response — it comes from the Go documentation's Usage limits table:
// https://opencode.ai/docs/go/#usage-limits
//
// Only the models this collector renders are listed. An unknown model gets no
// row rather than a percentage against a guessed denominator. Keep this table
// in step with the docs; unlike the rolling/weekly/monthly dollar budgets it is
// plan-specific, so each entry carries Go, Go Plus and Go Teams values.

const GO_MODEL_ALLOWANCES = Object.freeze({
  'deepseek-v4.1-flash': Object.freeze({
    name: 'DeepSeek V4.1 Flash',
    go: 100,
    goPlus: 200,
    goTeams: 105
  }),
  'deepseek-v4-pro': Object.freeze({
    name: 'DeepSeek V4 Pro',
    go: 15,
    goPlus: 60,
    goTeams: 20
  })
});

function goPlanKey(product) {
  const normalized = String(product || '').trim().toLowerCase().replace(/[^a-z]+/g, '');
  if (normalized === 'goplus') return 'goPlus';
  if (normalized === 'goteams') return 'goTeams';
  return 'go';
}

function goPlanLabel(product) {
  const key = goPlanKey(product);
  if (key === 'goPlus') return 'Go Plus';
  if (key === 'goTeams') return 'Go Teams';
  return 'Go';
}

function goModelAllowance(modelId, product) {
  const model = GO_MODEL_ALLOWANCES[String(modelId || '').trim()];
  if (!model) return null;
  const monthly = Number(model[goPlanKey(product)]);
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  return { name: model.name, monthly };
}

module.exports = {
  GO_MODEL_ALLOWANCES,
  goPlanKey,
  goPlanLabel,
  goModelAllowance
};
