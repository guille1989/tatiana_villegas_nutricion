process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS' })
require('../node_modules/ts-node/register/transpile-only')

const { calculateInitials } = require('../src/modules/calc/calc.ts')

const assertClose = (actual, expected, tolerance, message) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

const baseInputs = {
  name: 'Excel case',
  sex: 'male',
  age: 27,
  weight: 69,
  height: 185,
  bodyFat: undefined,
  profile: 'general',
  activityLevel: 'sedentary_training_5',
  goal: 'muscle_gain',
  dayType: 'rest',
  trainingType: undefined,
  duration: undefined,
}

const rest = calculateInitials(baseInputs).outputs
assertClose(rest.rmr, 1686, 1, 'RMR should match Excel average TMB')
assertClose(rest.pal, 1.5, 0.001, 'PAL should match Excel activity factor')
assertClose(rest.tdee, 2528, 1, 'TDEE should match Excel activity product')
assertClose(rest.kcalObjectiveBase, 3337, 1, 'Muscle gain kcal should match Excel GET * 1.2')
assertClose(rest.carbsAdjusted, 138, 0.1, 'Rest carbs should be 2 g/kg')
assertClose(rest.protein, 124.2, 0.1, 'Rest protein should be 1.8 g/kg')
assertClose(rest.fatsAdjusted, 254.3, 0.1, 'Rest fats should be residual kcal')

const trainingType1 = calculateInitials({ ...baseInputs, dayType: 'training_type_1' }).outputs
assertClose(trainingType1.kcalObjectiveDay, 3637, 1, 'Type 1 training kcal should add 300 kcal')
assertClose(trainingType1.carbsAdjusted, 345, 0.1, 'Type 1 carbs should be 5 g/kg')
assertClose(trainingType1.protein, 103.5, 0.1, 'Type 1 protein should be 1.5 g/kg')
assertClose(trainingType1.fatsAdjusted, 204.8, 0.1, 'Type 1 fats should be residual kcal')

const trainingType2 = calculateInitials({ ...baseInputs, dayType: 'training_type_2' }).outputs
assertClose(trainingType2.kcalObjectiveDay, 3337, 1, 'Type 2 training kcal should match base objective')
assertClose(trainingType2.carbsAdjusted, 138, 0.1, 'Type 2 carbs should be 2 g/kg')
assertClose(trainingType2.protein, 110.4, 0.1, 'Type 2 protein should be 1.6 g/kg')
assertClose(trainingType2.fatsAdjusted, 260.4, 0.1, 'Type 2 fats should be residual kcal')
