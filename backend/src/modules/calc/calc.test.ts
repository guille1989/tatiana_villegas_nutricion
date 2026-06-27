import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyMacroOverrideToOutputs,
  calculateMacroTargets,
  getDayTargetCalories,
} from './calc'

test('calculateMacroTargets uses fat as the calorie-closing macro', () => {
  const result = calculateMacroTargets({
    weightKg: 69,
    targetCalories: 3337,
    carbsPerKg: 2,
    proteinPerKg: 1.8,
  })

  assert.equal(result.carbs.grams, 138)
  assert.equal(result.carbs.calories, 552)
  assert.equal(result.protein.grams, 124.2)
  assert.ok(Math.abs(result.protein.calories - 496.8) < 1e-9)
  assert.ok(Math.abs(result.fat.calories - 2288.2) < 1e-9)
  assert.ok(Math.abs(result.totalCalories - 3337) < 1e-9)
  assert.equal(result.isValid, true)
})

test('training days add 300 kcal to the GET target', () => {
  assert.equal(getDayTargetCalories(3337, 'rest'), 3337)
  assert.equal(getDayTargetCalories(3337, 'training'), 3637)
  assert.equal(getDayTargetCalories(3337, 'training_type_1'), 3637)
  assert.equal(getDayTargetCalories(3337, 'training_type_2'), 3637)
})

test('calculateMacroTargets rejects inputs that would require negative fat', () => {
  const result = calculateMacroTargets({
    weightKg: 100,
    targetCalories: 1000,
    carbsPerKg: 2,
    proteinPerKg: 2,
  })

  assert.equal(result.fat.calories, -600)
  assert.equal(result.isValid, false)
})

test('macro overrides keep target calories and recalculate closing fat', () => {
  const outputs = {
    kcalObjectiveBase: 2000,
    kcalObjectiveDay: 2300,
    protein: 100,
    carbsAdjusted: 200,
    fatsAdjusted: 100,
  }
  const adjusted = applyMacroOverrideToOutputs({
    outputs,
    overrideMacros: {
      protein: 120,
      carbsAdjusted: 240,
      fatsAdjusted: 999,
    },
    dayType: 'training',
    goal: 'recomp',
    weight: 80,
  })

  assert.equal(adjusted.kcalObjectiveDay, 2300)
  assert.equal(adjusted.protein, 120)
  assert.equal(adjusted.carbsAdjusted, 240)
  assert.equal(adjusted.fatsAdjusted, 95.6)
  assert.equal(Math.round(adjusted.protein * 4 + adjusted.carbsAdjusted * 4 + adjusted.fatsAdjusted * 9), 2300)
})
