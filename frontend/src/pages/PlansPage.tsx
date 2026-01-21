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
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPlan, deletePlan, getLatestAssessment, getPlan, listPlans } from '../lib/api'
import { calculateDayFromBase, getCarbFactor, getEeeFactor } from '../lib/calc'
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

type DayType = 'training' | 'rest'

const calcKcalFromMacros = (macros: {
  protein: number
  carbsAdjusted: number
  fatsAdjusted: number
}) => Math.round(macros.protein * 4 + macros.carbsAdjusted * 4 + macros.fatsAdjusted * 9)

const round1 = (value: number) => Math.round(value * 10) / 10

const adjustCarbFat = ({
  protein,
  fats,
  carbs,
  kcalObjectiveDay,
  dayType,
  trainingType,
  eee = 0,
  goal,
}: {
  protein: number
  fats: number
  carbs: number
  kcalObjectiveDay: number
  dayType: DayType
  trainingType?: WizardInputs['trainingType'] | null
  eee?: number
  goal?: WizardInputs['goal'] | null
}) => {
  const carbFactor = dayType === 'training' ? getCarbFactor(dayType, trainingType) : 0.85
  const eeeFactor = goal ? getEeeFactor(goal) : 1
  const protKcal = protein * 4
  const baseCarbKcal = Math.max(carbs, 0) * 4
  const targCarb = baseCarbKcal * carbFactor
  const extraCarbKcal = dayType === 'rest' ? Math.max(eee, 0) * eeeFactor * carbFactor : 0
  const carbsAdjusted = round1((targCarb + extraCarbKcal) / 4)
  const remaining = Math.max(kcalObjectiveDay - protKcal - carbsAdjusted * 4, 0)
  const fatsAdjusted = round1(remaining / 9)
  return { carbsAdjusted, fatsAdjusted }
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

const applyPlanMacroOverride = (
  outputs: CalculationOutputs | null | undefined,
  plan: Plan | null | undefined,
  date: string,
  dayType: DayType,
  trainingType: WizardInputs['trainingType'] | null,
  goal?: WizardInputs['goal'] | null,
  activityDelta = 0,
) => {
  if (!outputs) return outputs
  const override = getPlanMacroOverrideForDate(plan, date)
  if (!override) return outputs
  const eeeFactor = goal ? getEeeFactor(goal) : 1
  const macroKcal =
    calcKcalFromMacros(override.macros) + (outputs.eee ?? 0) * eeeFactor
  const kcalObjectiveDay = macroKcal + activityDelta
  const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
    protein: override.macros.protein,
    fats: override.macros.fatsAdjusted,
    carbs: override.macros.carbsAdjusted,
    kcalObjectiveDay,
    dayType,
    trainingType,
    eee: outputs.eee ?? 0,
    goal,
  })
  return {
    ...outputs,
    kcalObjectiveDay,
    protein: override.macros.protein,
    carbsAdjusted,
    fatsAdjusted,
  }
}

const getMacroPercentages = (outputs?: CalculationOutputs | null) => {
  if (!outputs) return null
  const proteinKcal = outputs.protein * 4
  const carbsKcal = outputs.carbsAdjusted * 4
  const fatKcal = outputs.fatsAdjusted * 9
  const total = proteinKcal + carbsKcal + fatKcal
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
      activityDelta,
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

  const proteinKcal = outputs.protein * 4
  const carbsKcal = outputs.carbsAdjusted * 4
  const fatsKcal = outputs.fatsAdjusted * 9
  const total = proteinKcal + carbsKcal + fatsKcal

  const segments = [
    { val: proteinKcal, color: theme.palette.primary.main },
    { val: carbsKcal, color: theme.palette.success.main },
    { val: fatsKcal, color: theme.palette.warning.main },
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

type LineSeries = { values: (number | null)[]; color: string; dashed?: boolean; label: string }

const LineChart = ({ series, labels }: { series: LineSeries[]; labels: string[] }) => {
  const theme = useTheme()
  if (series.length === 0) return null

  const allValues = series
    .flatMap((item) => item.values)
    .filter((value): value is number => value !== null)
  if (allValues.length === 0) return null

  const width = 360
  const height = 160
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1
  const paddingY = 16
  const paddingX = 8
  const pointsCount = labels.length || Math.max(...series.map((item) => item.values.length))
  const xStep = (width - paddingX * 2) / Math.max(pointsCount - 1, 1)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const getPoint = (value: number, idx: number) => {
    const x = paddingX + idx * xStep
    const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2)
    return { x, y, point: `${x},${y}` }
  }

  const buildSegments = (values: (number | null)[]) => {
    const segments: string[] = []
    let current: string[] = []
    values.forEach((value, idx) => {
      if (value === null) {
        if (current.length > 0) {
          segments.push(current.join(' '))
          current = []
        }
        return
      }
      const { point } = getPoint(value, idx)
      current.push(point)
    })
    if (current.length > 0) segments.push(current.join(' '))
    return segments
  }

  const gridLines = Array.from({ length: 4 }, (_, idx) => {
    const y = paddingY + ((height - paddingY * 2) / 3) * idx
    return y
  })

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const svgX = (x / rect.width) * width
    const index = Math.round((svgX - paddingX) / xStep)
    const clamped = Math.max(0, Math.min(pointsCount - 1, index))
    const hasValueAtIndex = series.some((item) => item.values[clamped] !== null)
    if (!hasValueAtIndex) {
      setHoverIndex(null)
      setTooltipPos(null)
      return
    }
    setHoverIndex(clamped)
    setTooltipPos({ x, y })
  }

  const handleMouseLeave = () => {
    setHoverIndex(null)
    setTooltipPos(null)
  }

  const hoverX = hoverIndex !== null ? paddingX + hoverIndex * xStep : null

  return (
    <Box sx={{ position: 'relative', width: '100%', height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {gridLines.map((y, idx) => (
          <line
            key={idx}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={theme.palette.grey[200]}
            strokeWidth={1}
          />
        ))}
        {hoverX !== null && (
          <line
            x1={hoverX}
            y1={paddingY}
            x2={hoverX}
            y2={height - paddingY}
            stroke={theme.palette.grey[300]}
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}
        {series.map((item, seriesIdx) => {
          const segments = buildSegments(item.values)
          let lastIndex = -1
          for (let i = item.values.length - 1; i >= 0; i -= 1) {
            if (item.values[i] !== null) {
              lastIndex = i
              break
            }
          }
          const lastValue = lastIndex >= 0 ? item.values[lastIndex] : null
          const lastPoint = lastValue !== null ? getPoint(lastValue, lastIndex) : null
          return (
            <g key={seriesIdx}>
              {segments.map((segment, idx) => (
                <polyline
                  key={idx}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2.5}
                  strokeDasharray={item.dashed ? '6 6' : undefined}
                  points={segment}
                />
              ))}
              {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={item.color} />}
              {hoverIndex !== null && item.values[hoverIndex] !== null && (
                <circle
                  cx={getPoint(item.values[hoverIndex] as number, hoverIndex).x}
                  cy={getPoint(item.values[hoverIndex] as number, hoverIndex).y}
                  r={4}
                  fill={item.color}
                  stroke={theme.palette.common.white}
                  strokeWidth={2}
                />
              )}
            </g>
          )
        })}
      </svg>
      {hoverIndex !== null && tooltipPos && (
        <Box
          sx={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, -120%)',
            bgcolor: 'common.white',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
            px: 1.5,
            py: 1,
            minWidth: 160,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {labels[hoverIndex] ?? ''}
          </Typography>
          <Stack spacing={0.5} mt={0.5}>
            {series.map((item) => (
              <Stack key={item.label} direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: item.color,
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {item.label}
                </Typography>
                <Typography variant="subtitle2" fontWeight={700}>
                  {item.values[hoverIndex] !== null ? Math.round(item.values[hoverIndex] as number) : '--'}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
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
      } catch (err) {
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

  const syncLabels = syncSeries.map((item) => dayjs(item.date).format('DD/MM'))
  const targetSeries = syncSeries.map((item) => item.targetKcal)
  const consumedSeries = syncSeries.map((item) => item.consumedKcal)
  const consumedValues = consumedSeries.filter((value): value is number => value !== null)
  const hasConsumedData = consumedValues.length > 0
  const hasTargetData = targetSeries.some((value) => value !== null)

  const avgConsumed = consumedValues.length
    ? Math.round(consumedValues.reduce((acc, value) => acc + value, 0) / consumedValues.length)
    : null

  let latestConsumedPoint: SyncPoint | null = null
  for (let i = syncSeries.length - 1; i >= 0; i -= 1) {
    if (syncSeries[i].consumedKcal !== null) {
      latestConsumedPoint = syncSeries[i]
      break
    }
  }

  let latestTargetPoint: SyncPoint | null = null
  for (let i = syncSeries.length - 1; i >= 0; i -= 1) {
    if (syncSeries[i].targetKcal !== null) {
      latestTargetPoint = syncSeries[i]
      break
    }
  }

  const latestConsumed = latestConsumedPoint?.consumedKcal ?? null
  const latestTarget = latestConsumedPoint?.targetKcal ?? latestTargetPoint?.targetKcal ?? null
  const macroSummary =
    latestConsumedPoint?.targetMacros && latestConsumedPoint?.consumedMacros
      ? [
          {
            label: 'P',
            target: latestConsumedPoint.targetMacros.protein,
            consumed: latestConsumedPoint.consumedMacros.protein,
          },
          {
            label: 'C',
            target: latestConsumedPoint.targetMacros.carbs,
            consumed: latestConsumedPoint.consumedMacros.carbs,
          },
          {
            label: 'G',
            target: latestConsumedPoint.targetMacros.fat,
            consumed: latestConsumedPoint.consumedMacros.fat,
          },
        ]
      : null

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
                      activityDelta,
                    )
                    const planKcal = adjustedOutputs?.kcalObjectiveDay
                    const macros = getMacroPercentages(adjustedOutputs)
                    const isActive = plan.status === 'active'
                    const isSelected = plan.id === selectedPlanId
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
                              label={isActive ? 'Activo' : 'No activo'}
                              size="small"
                              color={isActive ? 'success' : 'default'}
                              variant={isActive ? 'filled' : 'outlined'}
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
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(plan)}
                            >
                              Eliminar
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
              <Stack spacing={2} height="100%">
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={700}>
                      Consumo de calorias
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Progreso en los últimos 30 días
                    </Typography>
                  </Stack>
                  <SyncRoundedIcon sx={{ color: 'text.secondary' }} />
                </Stack>

                {!hasTargetData ? (
                  <Stack
                    spacing={1.5}
                    alignItems="center"
                    justifyContent="center"
                    sx={{ flex: 1, textAlign: 'center' }}
                  >
                    <Typography variant="subtitle1" fontWeight={700}>
                      Sin datos del plan
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Aun no hay objetivos disponibles para graficar.
                    </Typography>
                  </Stack>
                ) : (
                  <Stack spacing={2} flex={1}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      justifyContent="space-between"
                    >
                      <Stack direction="row" spacing={3} alignItems="baseline" flexWrap="wrap">
                        <Stack spacing={0.5}>
                          <Typography variant="h5" fontWeight={800}>
                            {avgConsumed !== null ? avgConsumed : '--'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Promedio consumido
                          </Typography>
                        </Stack>
                        <Stack spacing={0.5}>
                          <Typography variant="h5" fontWeight={800}>
                            {latestConsumed !== null ? Math.round(latestConsumed) : '--'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Ultimo dia
                          </Typography>
                        </Stack>
                        <Stack spacing={0.5}>
                          <Typography variant="h5" fontWeight={800}>
                            {latestTarget !== null ? Math.round(latestTarget) : '--'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Objetivo kcal
                          </Typography>
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        {hasTargetData && (
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: theme.palette.secondary.main,
                              }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              Objetivo
                            </Typography>
                          </Stack>
                        )}
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: theme.palette.primary.main,
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Consumido
                          </Typography>
                        </Stack>
                      </Stack>
                    </Stack>
                    {!hasConsumedData && (
                      <Typography variant="caption" color="text.secondary">
                        Sin consumos registrados aun.
                      </Typography>
                    )}
                    <Box sx={{ flex: 1 }}>
                      <LineChart
                        labels={syncLabels}
                        series={[
                          ...(hasTargetData
                            ? [
                                {
                                  values: targetSeries,
                                  color: theme.palette.secondary.main,
                                  dashed: true,
                                  label: 'Objetivo kcal',
                                },
                              ]
                            : []),
                          {
                            values: consumedSeries,
                            color: theme.palette.primary.main,
                            label: 'Consumidas kcal',
                          },
                        ]}
                      />
                    </Box>
                    {macroSummary && (
                      <Stack direction="row" spacing={2} flexWrap="wrap">
                        {macroSummary.map((item) => (
                          <Stack key={item.label} spacing={0.25}>
                            <Typography variant="caption" color="text.secondary">
                              {item.label}
                            </Typography>
                            <Typography variant="subtitle2" fontWeight={700}>
                              {Math.round(item.target)}g / {Math.round(item.consumed)}g
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                )}
              </Stack>
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
