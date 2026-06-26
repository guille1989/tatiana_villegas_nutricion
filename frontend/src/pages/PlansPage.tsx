import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import AutoGraphRoundedIcon from '@mui/icons-material/AutoGraphRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WeeklyIntakeCard from '../components/WeeklyIntakeCard'
import { createPlan, deletePlan, getLatestAssessment, getPlan, listPlans } from '../lib/api'
import { applyMacroOverrideToOutputs, calculateDayFromBase, getMacroKcalBreakdown } from '../lib/calc'
import type { Assessment, CalculationOutputs, DayOverride, Meal, Plan, WizardInputs } from '../types'

type PlanDetail = {
  assessment?: Assessment
  outputs?: CalculationOutputs
  overrides: DayOverride[]
}

type MacroSummary = { protein: number; carbs: number; fat: number }
type MacroTotals = MacroSummary & { kcal: number }

type SyncPoint = {
  date: string
  targetKcal: number | null
  consumedKcal: number | null
  targetMacros: MacroSummary | null
  consumedMacros: MacroSummary | null
}

type DayType = 'rest' | 'training_type_1' | 'training_type_2' | 'training'
const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const

const buildSevenDaySyncWindow = (syncSeries: SyncPoint[]): SyncPoint[] => {
  if (syncSeries.length === 0) return []

  const dateMap = new Map(syncSeries.map((item) => [item.date, item]))
  const sortedDates = [...syncSeries]
    .map((item) => dayjs(item.date).startOf('day'))
    .sort((a, b) => a.valueOf() - b.valueOf())

  const planStart = sortedDates[0]

  const fallbackPoint =
    syncSeries.find((item) => (item.targetKcal ?? 0) > 0) ?? syncSeries[0]

  return Array.from({ length: 7 }, (_, index) => {
    const date = planStart.add(index, 'day').format('YYYY-MM-DD')
    const existing = dateMap.get(date)
    if (existing) return existing
    return {
      date,
      targetKcal: fallbackPoint?.targetKcal ?? null,
      consumedKcal: null,
      targetMacros: fallbackPoint?.targetMacros ?? null,
      consumedMacros: null,
    }
  })
}

const getPlanMacroOverrideForDate = (plan: Plan | null | undefined, date: string) => {
  const overrides = plan?.macroOverrides ?? []
  if (overrides.length === 0) return null
  const filtered = overrides.filter((item) => item.effectiveFrom <= date)
  if (filtered.length === 0) return null
  return filtered.reduce((latest, item) => (item.effectiveFrom > latest.effectiveFrom ? item : latest))
}

const getDayType = (override?: DayOverride | null, baseDayType?: DayType | null) =>
  override?.overrides.dayType ?? baseDayType ?? 'rest'

const getTrainingType = (
  override?: DayOverride | null,
  baseInputs?: WizardInputs | null,
): WizardInputs['trainingType'] | null => {
  const overrideTraining =
    override?.overrides?.trainings?.find((item) => item?.type)?.type ??
    override?.overrides?.training?.type ??
    null
  return (overrideTraining ?? baseInputs?.trainingType ?? null) as WizardInputs['trainingType'] | null
}

const getDayMacroOverride = (override?: DayOverride | null) => {
  if (!override?.overrides?.macroOverride) return null
  return {
    protein: override.overrides.macroOverride.protein,
    carbsAdjusted: override.overrides.macroOverride.carbsAdjusted,
    fatsAdjusted: override.overrides.macroOverride.fatsAdjusted,
  }
}

const applyPlanMacroOverride = (
  outputs: CalculationOutputs | null | undefined,
  plan: Plan | null | undefined,
  date: string,
  dayType: DayType,
  trainingType: WizardInputs['trainingType'] | null,
  goal?: WizardInputs['goal'] | null,
  weight = 0,
  activityDelta = 0,
  dayOverride?: DayOverride | null,
) => {
  if (!outputs) return outputs
  const dailyOverride = getDayMacroOverride(dayOverride)
  const planOverride = getPlanMacroOverrideForDate(plan, date)
  const overrideMacros = dailyOverride ?? planOverride?.macros ?? null
  if (!overrideMacros) return outputs
  if (!goal) return outputs
  return applyMacroOverrideToOutputs({
    outputs,
    overrideMacros,
    dayType,
    trainingType,
    goal,
    weight,
    activityDelta,
  })
}

const getMacroPercentages = (outputs?: CalculationOutputs | null) => {
  if (!outputs) return null
  const { proteinKcal, carbsKcal, fatKcal, totalKcal } = getMacroKcalBreakdown({
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
  })
  const total = totalKcal
  if (total <= 0) return null
  return {
    protein: Math.round((proteinKcal / total) * 100),
    carbs: Math.round((carbsKcal / total) * 100),
    fat: Math.round((fatKcal / total) * 100),
  }
}

const isPlanEnded = (plan: Plan) =>
  dayjs(plan.startDate).add(plan.days - 1, 'day').isBefore(dayjs(), 'day')

const totalsFromMeals = (meals: Meal[]): MacroTotals =>
  meals.reduce(
    (acc, meal) => ({
      protein: acc.protein + meal.totals.protein,
      carbs: acc.carbs + meal.totals.carbs,
      fat: acc.fat + meal.totals.fat,
      kcal: acc.kcal + meal.totals.kcal,
    }),
    { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  )

const getTargetMacros = (outputs?: CalculationOutputs | null) => {
  if (!outputs) return null
  return {
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
    kcal: outputs.kcalObjectiveDay,
  }
}

const getOverrideMeals = (override?: DayOverride | null) =>
  (override?.meals as Meal[] | undefined) ?? override?.overrides?.meals

const buildSyncSeries = (
  overrides: DayOverride[],
  outputs: CalculationOutputs | undefined,
  plan: Plan | null | undefined,
  baseDayType?: DayType | null,
  baseInputs?: WizardInputs | null,
): SyncPoint[] => {
  const overrideMap = new Map(overrides.map((item) => [item.date, item]))
  const planStart = plan?.startDate
  const planDays = plan?.days
  if (!planStart || !planDays) return []

  const planStartDate = dayjs(planStart)
  const rangeStart = planStartDate
  const daysCount = planDays

  return Array.from({ length: daysCount }, (_, idx) => {
    const date = rangeStart.add(idx, 'day').format('YYYY-MM-DD')
    const override = overrideMap.get(date)
    const dayType = getDayType(override, baseDayType)
    const trainingType = getTrainingType(override, baseInputs)
    let activityDelta = 0
    if (
      baseInputs &&
      override?.overrides?.activityLevel !== undefined &&
      override?.overrides?.activityLevel !== null
    ) {
      try {
        const baseOverrides = { ...override.overrides, activityLevel: undefined }
        const baseOutputs = calculateDayFromBase(baseInputs, baseOverrides)
        const activityOutputs = calculateDayFromBase(baseInputs, override.overrides)
        activityDelta = (activityOutputs.kcalObjectiveDay ?? 0) - (baseOutputs.kcalObjectiveDay ?? 0)
      } catch {
        activityDelta = 0
      }
    }
    const targetBase = applyPlanMacroOverride(
      override?.computed ?? outputs ?? null,
      plan,
      date,
      dayType,
      trainingType,
      baseInputs?.goal ?? null,
      baseInputs?.weight ?? 0,
      activityDelta,
      override,
    )
    const target = getTargetMacros(targetBase)
    const meals = getOverrideMeals(override)
    const totals = meals && meals.length > 0 ? totalsFromMeals(meals) : null

    return {
      date,
      targetKcal: target?.kcal ?? null,
      consumedKcal: totals?.kcal ?? null,
      targetMacros: target
        ? { protein: target.protein, carbs: target.carbs, fat: target.fat }
        : null,
      consumedMacros: totals
        ? { protein: totals.protein, carbs: totals.carbs, fat: totals.fat }
        : null,
    }
  })
}

const MacroDonut = ({ outputs }: { outputs?: CalculationOutputs | null }) => {
  const theme = useTheme()
  const size = 44
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  if (!outputs) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `2px dashed ${theme.palette.grey[300]}`,
        }}
      />
    )
  }

  const { proteinKcal, carbsKcal, fatKcal, totalKcal } = getMacroKcalBreakdown({
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
  })
  const total = totalKcal

  const segments = [
    { val: proteinKcal, color: theme.palette.primary.main },
    { val: carbsKcal, color: theme.palette.success.main },
    { val: fatKcal, color: theme.palette.warning.main },
  ]

  let offset = 0

  return (
    <Box sx={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.palette.grey[200]}
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((seg, idx) => {
            const dash = (seg.val / total) * circumference
            const circle = (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            )
            offset += dash
            return circle
          })}
      </svg>
    </Box>
  )
}

const PlansPage = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<Plan[]>([])
  const [planDetails, setPlanDetails] = useState<Record<string, PlanDetail>>({})
  const [loading, setLoading] = useState(true)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDays, setCreateDays] = useState<Plan['days']>(30)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [missingAssessment, setMissingAssessment] = useState(false)
  const [cloneLoading, setCloneLoading] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadPlans = async () => {
      setLoading(true)
      try {
        const res = await listPlans()
        if (!active) return
        setPlans(res)
      } catch {
        if (active) setPlans([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPlans()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadDetails = async () => {
      if (plans.length === 0) {
        setPlanDetails({})
        return
      }
      const results = await Promise.allSettled(plans.map((plan) => getPlan(plan.id)))
      if (!active) return
      const details: Record<string, PlanDetail> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          details[plans[index].id] = {
            assessment: result.value.assessment,
            outputs: result.value.assessment?.outputs,
            overrides: result.value.overrides ?? [],
          }
        }
      })
      setPlanDetails(details)
    }

    loadDetails()
    return () => {
      active = false
    }
  }, [plans])

  const activePlan = useMemo(() => {
    if (!plans.length) return null
    return plans.find((plan) => plan.status === 'active') ?? plans[0]
  }, [plans])

  const hasActivePlan = useMemo(
    () => plans.some((plan) => plan.status === 'active' || !plan.status),
    [plans],
  )

  useEffect(() => {
    if (!plans.length) return
    if (selectedPlanId && plans.some((plan) => plan.id === selectedPlanId)) return
    const defaultPlan = plans.find((plan) => plan.status === 'active') ?? plans[0]
    setSelectedPlanId(defaultPlan.id)
  }, [plans, selectedPlanId])

  const selectedPlan = useMemo(() => {
    if (!plans.length) return null
    if (!selectedPlanId) return activePlan ?? plans[0]
    return plans.find((plan) => plan.id === selectedPlanId) ?? activePlan ?? plans[0]
  }, [activePlan, plans, selectedPlanId])

  const activePlanEnded = activePlan ? isPlanEnded(activePlan) : false
  const selectedPlanDetail = selectedPlan ? planDetails[selectedPlan.id] : undefined
  const syncSeries = useMemo(() => {
    if (!selectedPlanDetail) return []
    return buildSyncSeries(
      selectedPlanDetail.overrides,
      selectedPlanDetail.outputs,
      selectedPlan,
      selectedPlanDetail.assessment?.inputs?.dayType ?? null,
      selectedPlanDetail.assessment?.inputs ?? null,
    )
  }, [selectedPlan, selectedPlanDetail])

  const weeklySyncSeries = useMemo(() => {
    return buildSevenDaySyncWindow(syncSeries)
  }, [syncSeries])

  const hasTargetData = weeklySyncSeries.some((item) => (item.targetKcal ?? 0) > 0)

  const weeklyIntakeData = useMemo(
    () =>
      weeklySyncSeries.map((item) => {
        const dayIndex = dayjs(item.date).day()
        return {
          date: item.date,
          dayLabel: DAY_LABELS[dayIndex],
          caloriesConsumed: item.consumedKcal,
          caloriesTarget: item.targetKcal ?? 0,
          proteinConsumedG: item.consumedMacros?.protein ?? null,
          carbsConsumedG: item.consumedMacros?.carbs ?? null,
          fatsConsumedG: item.consumedMacros?.fat ?? null,
          proteinTargetG: item.targetMacros?.protein ?? 0,
          carbsTargetG: item.targetMacros?.carbs ?? 0,
          fatsTargetG: item.targetMacros?.fat ?? 0,
        }
      }),
    [weeklySyncSeries],
  )

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deletePlan(deleteTarget.id)
      setPlans((prev) => prev.filter((plan) => plan.id !== deleteTarget.id))
      setSnackbar('Plan eliminado')
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'No se pudo eliminar')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleClonePlan = async () => {
    if (!activePlan) return
    setCloneLoading(true)
    try {
      const newPlan = await createPlan({
        baseAssessmentId: activePlan.baseAssessmentId,
        startDate: dayjs().toISOString(),
        days: activePlan.days,
        title: `Copia de ${activePlan.title ?? `Plan ${activePlan.days} dias`}`,
      })
      navigate(`/plans/${newPlan.id}`)
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'No se pudo clonar el plan')
    } finally {
      setCloneLoading(false)
    }
  }

  const handleCreatePlan = async () => {
    setCreateLoading(true)
    setCreateError(null)
    setMissingAssessment(false)
    try {
      const assessment = await getLatestAssessment()
      const newPlan = await createPlan({
        baseAssessmentId: assessment.id,
        startDate: dayjs().toISOString(),
        days: createDays,
      })
      navigate(`/plans/${newPlan.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el plan'
      const msgLower = message.toLowerCase()
      setCreateError(message)
      setMissingAssessment(msgLower.includes('assessment') || msgLower.includes('evaluacion') || msgLower.includes('no encontrado'))
    } finally {
      setCreateLoading(false)
    }
  }

  const lightCard = {
    borderRadius: 4,
    minHeight: { xs: 420, md: 520 },
    bgcolor: 'common.white',
    border: '1px solid',
    borderColor: 'divider',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
  }

  const planItems = useMemo(
    () => [...plans].sort((a, b) => dayjs(b.startDate).diff(dayjs(a.startDate))),
    [plans],
  )

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Planes
          </Typography>
          <Typography color="text.secondary">
            Tus planes activos y el seguimiento de tu progreso.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
            },
          }}
        >
          <Card elevation={0} sx={lightCard}>
            <CardContent sx={{ height: '100%' }}>
              <Stack spacing={2} height="100%">
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={700}>
                      Planning
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Planes en uso recientemente
                    </Typography>
                  </Stack>
                  <ChevronRightRoundedIcon sx={{ color: 'text.secondary' }} />
                </Stack>

                {loading && (
                  <Typography variant="body2" color="text.secondary">
                    Cargando planes...
                  </Typography>
                )}

                {!loading && !hasActivePlan && (
                  <Alert
                    severity="info"
                    action={
                      <Button size="small" variant="outlined" onClick={() => navigate('/wizard')}>
                        Ir al wizard
                      </Button>
                    }
                  >
                    Aun no tienes planes creados. Completa el wizard.
                  </Alert>
                )}

                <Stack spacing={1.5} sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
                  {planItems.map((plan) => {
                    const detail = planDetails[plan.id]
                    const planStartDate = dayjs(plan.startDate)
                    const planEndDate = planStartDate.add(plan.days - 1, 'day')
                    const today = dayjs()
                    const displayDate = (today.isBefore(planStartDate, 'day')
                      ? planStartDate
                      : today.isAfter(planEndDate, 'day')
                        ? planEndDate
                        : today
                    ).format('YYYY-MM-DD')
                    const baseDayType = detail?.assessment?.inputs?.dayType ?? null
                    const baseInputs = detail?.assessment?.inputs ?? null
                    const displayOverride = detail?.overrides?.find((item) => item.date === displayDate)
                    const displayTrainingType = getTrainingType(displayOverride, baseInputs)
                    let activityDelta = 0
                    if (
                      baseInputs &&
                      displayOverride?.overrides?.activityLevel !== undefined &&
                      displayOverride?.overrides?.activityLevel !== null
                    ) {
                      try {
                        const baseOverrides = { ...displayOverride.overrides, activityLevel: undefined }
                        const baseOutputs = calculateDayFromBase(baseInputs, baseOverrides)
                        const activityOutputs = calculateDayFromBase(baseInputs, displayOverride.overrides)
                        activityDelta =
                          (activityOutputs.kcalObjectiveDay ?? 0) - (baseOutputs.kcalObjectiveDay ?? 0)
                      } catch {
                        activityDelta = 0
                      }
                    }
                    const adjustedOutputs = applyPlanMacroOverride(
                      detail?.outputs,
                      plan,
                      displayDate,
                      baseDayType ?? 'rest',
                      displayTrainingType,
                      baseInputs?.goal ?? null,
                      baseInputs?.weight ?? 0,
                      activityDelta,
                      displayOverride,
                    )
                    const planKcal = adjustedOutputs?.kcalObjectiveDay
                    const macros = getMacroPercentages(adjustedOutputs)
                    const isActive = plan.status === 'active'
                    const isEnded = isPlanEnded(plan)
                    const isSelected = plan.id === selectedPlanId
                    const statusChipLabel = isActive
                      ? isEnded
                        ? 'Finalizado'
                        : 'Activo'
                      : 'No activo'
                    const statusChipColor: 'success' | 'warning' | 'default' = isActive
                      ? isEnded
                        ? 'warning'
                        : 'success'
                      : 'default'
                    const statusColor =
                      isActive
                        ? theme.palette.success.main
                        : plan.status === 'archived'
                          ? theme.palette.grey[400]
                          : theme.palette.warning.main
                    const planLabel = plan.title ?? `Plan ${plan.days} dias - ${dayjs(plan.startDate).format('DD/MM/YYYY')}`
                    return (
                      <Box
                        key={plan.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPlanId(plan.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedPlanId(plan.id)
                          }
                        }}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          border: '1px solid',
                          borderColor: isSelected ? theme.palette.primary.main : 'divider',
                          backgroundColor: isSelected
                            ? alpha(theme.palette.primary.main, 0.08)
                            : isActive
                              ? alpha(theme.palette.success.main, 0.08)
                              : alpha(theme.palette.primary.main, 0.04),
                          cursor: 'pointer',
                          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                          boxShadow: isSelected ? '0 12px 28px rgba(37, 99, 235, 0.12)' : 'none',
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  bgcolor: statusColor,
                                }}
                              />
                              <Typography fontWeight={700}>
                                {planLabel}
                              </Typography>
                            </Stack>
                            <Chip
                              label={statusChipLabel}
                              size="small"
                              color={statusChipColor}
                              variant={isActive && !isEnded ? 'filled' : 'outlined'}
                              sx={
                                !isActive
                                  ? {
                                      color: 'text.secondary',
                                      borderColor: theme.palette.grey[300],
                                    }
                                  : undefined
                              }
                            />
                          </Stack>

                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <MacroDonut outputs={adjustedOutputs} />
                            <Stack spacing={0.5} flex={1}>
                              {macros ? (
                                <Typography variant="body2" color="text.secondary">
                                  P {macros.protein}% / C {macros.carbs}% / G {macros.fat}%
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  Macros no disponibles
                                </Typography>
                              )}
                              <Typography variant="subtitle2" fontWeight={700}>
                                {planKcal !== undefined ? Math.round(planKcal) : '--'} kcal
                              </Typography>
                            </Stack>
                          </Stack>

                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate(`/plans/${plan.id}`)}
                              disabled={!isActive}
                            >
                              Abrir
                            </Button>
                            
                          </Stack>
                        </Stack>
                      </Box>
                    )
                  })}
                </Stack>

                {activePlan && (
                  <Box mt="auto">
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={activePlanEnded ? 'Plan finalizado' : 'Plan en curso'}
                          size="small"
                          color={activePlanEnded ? 'warning' : 'success'}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {activePlan.title ?? `Plan ${activePlan.days} dias`}
                        </Typography>
                      </Stack>
                      {activePlanEnded && (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                          <Button
                            variant="contained"
                            onClick={handleClonePlan}
                            disabled={cloneLoading}
                            fullWidth
                          >
                            {cloneLoading ? 'Clonando...' : 'Clonar plan actual'}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => {
                              setCreateDialogOpen(true)
                              setCreateError(null)
                              setMissingAssessment(false)
                            }}
                            fullWidth
                          >
                            Crear nuevo plan
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card elevation={0} sx={lightCard} style={{display: 'none'}}>
            <CardContent sx={{ height: '100%' }}>
              <Stack spacing={2} height="100%">
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={700}>
                      Composición corporal
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Progreso en los últimos 30 días
                    </Typography>
                  </Stack>
                  <ChevronRightRoundedIcon sx={{ color: 'text.secondary' }} />
                </Stack>

                <Stack
                  spacing={1.5}
                  alignItems="center"
                  justifyContent="center"
                  sx={{ flex: 1, textAlign: 'center' }}
                >
                  <AutoGraphRoundedIcon sx={{ fontSize: 42, color: 'text.secondary' }} />
                  <Typography variant="subtitle1" fontWeight={700}>
                    No data yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Registra datos de composicion corporal para ver tu evolucion aqui.
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card elevation={0} sx={lightCard}>
            <CardContent sx={{ height: '100%' }}>
              {!hasTargetData ? (
                <Stack
                  spacing={1.5}
                  alignItems="center"
                  justifyContent="center"
                  sx={{ height: '100%', textAlign: 'center' }}
                >
                  <Typography variant="subtitle1" fontWeight={700}>
                    Sin datos del plan
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Aun no hay objetivos disponibles para graficar.
                  </Typography>
                </Stack>
              ) : (
                <WeeklyIntakeCard
                  weeklyData={weeklyIntakeData}
                  adherenceTolerancePct={5}
                  title="Seguimiento semanal"
                  subtitle="Resumen nutricional de los ultimos 7 dias"
                  fillChartHeight
                  centerTooltip
                  detailStatusRule="macros"
                />
              )}
            </CardContent>
          </Card>
        </Box>
      </Stack>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Crear nuevo plan</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {createError && <Alert severity={missingAssessment ? 'info' : 'warning'}>{createError}</Alert>}
            <FormControl fullWidth>
              <InputLabel>Duracion</InputLabel>
              <Select
                value={createDays}
                label="Duracion"
                onChange={(event) => setCreateDays(event.target.value as Plan['days'])}
              >
                {[5, 7, 15, 30].map((days) => (
                  <MenuItem key={days} value={days}>
                    {days} dias
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {missingAssessment && (
              <Button variant="outlined" onClick={() => navigate('/wizard')}>
                Ir al wizard
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreatePlan} disabled={createLoading}>
            {createLoading ? 'Creando...' : 'Crear plan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Eliminar plan</DialogTitle>
        <DialogContent>Eliminar {deleteTarget?.title ?? 'este plan'}? Tambien se borraran sus overrides.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button color="error" onClick={handleDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        message={snackbar}
        onClose={() => setSnackbar(null)}
      />
    </Container>
  )
}

export default PlansPage
