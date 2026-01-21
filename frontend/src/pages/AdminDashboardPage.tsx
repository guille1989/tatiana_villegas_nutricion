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
  Divider,
  FormControl,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createInvite,
  getAdminOverview,
  listInvites,
  upsertPlanMacroOverride,
  updatePlanStatus,
  type AdminOverviewItem,
  type Invite,
} from '../lib/api'
import { calculateDayFromBase, getCarbFactor, getEeeFactor } from '../lib/calc'
import AdminIngredientsSection from '../components/AdminIngredientsSection'
import {
  activityOptions,
  dayTypeOptions,
  goalOptions,
  profileOptions,
  sexOptions,
  trainingOptions,
} from '../lib/schema'
import { getMacroState, type MacroState } from '../lib/macroStatus'
import type { Assessment, CalculationOutputs, DayOverride, Meal, Plan, WizardInputs } from '../types'

type AdherenceState = MacroState | 'none'

type AdherenceSummary = {
  state: AdherenceState
  progress: number
  label: string
  lastDate?: string
}

type TrendPoint = {
  date: string
  label: string
  progress: number
  state: AdherenceState
}

type MacroSummary = { protein: number; carbs: number; fat: number }
type MacroTotals = MacroSummary & { kcal: number }
type DayType = 'training' | 'rest'

type SyncPoint = {
  date: string
  targetKcal: number | null
  consumedKcal: number | null
}

type OutputRow = {
  label: string
  value: string
  adjustedValue?: string
}

type AdminRecord = {
  userId: string
  userName?: string
  userCreatedAt?: string
  latestAssessment?: Assessment | null
  plan?: Plan | null
  overrides: DayOverride[]
  lastUpdate?: string | null
  adherence: AdherenceSummary
  trend: TrendPoint[]
}

type AdminSection = 'overview' | 'ingredients'

const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string }> = [
  { id: 'overview', label: 'Resumen' },
  { id: 'ingredients', label: 'Ingredientes' },
]

const GOAL_LABELS: Record<string, string> = {
  fat_loss: 'Perdida grasa',
  muscle_gain: 'Ganancia muscular',
  recomp: 'Recomposicion',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  draft: 'Borrador',
  archived: 'Archivado',
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  draft: 'warning',
  archived: 'default',
}

const INVITE_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  disabled: 'warning',
  expired: 'error',
  consumed: 'default',
}

const optionLabel = (
  value: string | null | undefined,
  options: ReadonlyArray<{ value: string; label: string }>,
) => {
  if (!value) return '--'
  const match = options.find((item) => item.value === value)
  return match ? match.label : value
}

const formatNumber = (value: number) => Math.round(value).toString()

const formatValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '--'
  if (typeof value === 'number') return formatNumber(value)
  return value
}

const formatWithUnit = (value: number | null | undefined, unit: string) => {
  if (value === null || value === undefined) return '--'
  return `${formatNumber(value)} ${unit}`
}

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
  weight,
}: {
  protein: number
  fats: number
  carbs: number
  kcalObjectiveDay: number
  dayType: DayType
  trainingType?: WizardInputs['trainingType'] | null
  eee?: number
  goal?: WizardInputs['goal'] | null
  weight: number
}) => {
  const carbFactor = dayType === 'training' ? getCarbFactor(dayType, trainingType) : 0.85
  const fatFactor = dayType === 'training' ? 1 - carbFactor : 0
  const eeeFactor = goal ? getEeeFactor(goal) : 1
  console.log({ protein, fats, carbs, kcalObjectiveDay, dayType, trainingType, eee, goal, weight, eeeFactor })
  const rec = goal === 'fat_loss' ? 0.7 : 1
  const grasaMin = 0.6 * weight
  const eeeSafe = Math.max(eee, 0)
  const baseCarbs = Math.max(carbs, 0)
  let carbsAdjusted: number
  if (dayType === 'training') {
    const extraCarbGrams = (eeeSafe * rec * carbFactor) / 4
    carbsAdjusted = round1(baseCarbs + extraCarbGrams)
  } else {
    carbsAdjusted = round1(baseCarbs)
  }
  const baseFats = Math.max(fats, 0)
  let fatsAdjusted = baseFats
  if (dayType === 'training') {
    const extraFat = (eeeSafe * rec * fatFactor) / 9
    fatsAdjusted = baseFats + extraFat
  }
  fatsAdjusted = round1(Math.max(grasaMin, fatsAdjusted))
  return { carbsAdjusted, fatsAdjusted }
}

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

const getOverrideMeals = (override?: DayOverride | null) => {
  const meals = (override?.meals as Meal[] | undefined) ?? override?.overrides?.meals
  return Array.isArray(meals) ? meals : undefined
}

const getPlanLabel = (plan?: Plan | null) => {
  if (!plan) return 'Sin plan'
  return plan.title ?? `Planificación 1`
}

const getTargetMacros = (outputs?: CalculationOutputs | null) => {
  if (!outputs) return null
  return {
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
    kcal: outputs.kcalObjectiveDay,
  }
}

const getBudgetFromOutputs = (outputs?: CalculationOutputs | null) => {
  if (!outputs) return null
  return {
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
    kcal: outputs.kcalObjectiveDay,
  }
}

const getPlanMacroOverrideForDate = (plan: Plan | null | undefined, date: string) => {
  const overrides = plan?.macroOverrides ?? []
  if (overrides.length === 0) return null
  const filtered = overrides.filter((item) => item.effectiveFrom <= date)
  if (filtered.length === 0) return null
  return filtered.reduce((latest, item) =>
    item.effectiveFrom > latest.effectiveFrom ? item : latest,
  )
}

const getDayType = (override?: DayOverride | null, baseDayType?: DayType) =>
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
  weight = 0,
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
    weight,
  })
  return {
    ...outputs,
    kcalObjectiveDay,
    protein: override.macros.protein,
    carbsAdjusted,
    fatsAdjusted,
  }
}

const toPortions = (macros: { protein: number; carbs: number; fat: number }) => ({
  protein: macros.protein / 10,
  carbs: macros.carbs / 15,
  fat: macros.fat / 5,
})

const getAdherenceFromMeals = (meals: Meal[] | undefined, outputs?: CalculationOutputs | null): AdherenceSummary => {
  if (!meals || meals.length === 0 || !outputs) {
    return { state: 'none', progress: 0, label: 'Sin datos' }
  }

  const totals = totalsFromMeals(meals)
  const budget = getBudgetFromOutputs(outputs)
  if (!budget) return { state: 'none', progress: 0, label: 'Sin datos' }

  const used = { protein: totals.protein, carbs: totals.carbs, fat: totals.fat }
  const budgetPortions = toPortions(budget)
  const usedPortions = toPortions(used)
  const remaining = {
    protein: budgetPortions.protein - usedPortions.protein,
    carbs: budgetPortions.carbs - usedPortions.carbs,
    fat: budgetPortions.fat - usedPortions.fat,
  }

  const states: MacroState[] = (['protein', 'carbs', 'fat'] as const).map((key) =>
    getMacroState(remaining[key], budgetPortions[key], key),
  )

  const state: AdherenceState = states.includes('over')
    ? 'over'
    : states.every((item) => item === 'ok')
      ? 'ok'
      : 'pending'

  const ratios = (['protein', 'carbs', 'fat'] as const)
    .map((key) => {
      const base = budget[key]
      if (base <= 0) return null
      return used[key] / base
    })
    .filter((value): value is number => value !== null)

  const avgRatio = ratios.length ? ratios.reduce((acc, value) => acc + value, 0) / ratios.length : 0
  const progress = Math.round(Math.min(avgRatio * 100, 100))

  const label = state === 'ok' ? 'Cumplido' : state === 'over' ? 'Exceso' : 'Pendiente'
  return { state, progress, label }
}

const getLastUpdateDate = (plan?: Plan | null, overrides: DayOverride[] = []) => {
  const latestOverride = overrides.reduce<DayOverride | null>((acc, item) => {
    if (!acc) return item
    return dayjs(item.updatedAt).isAfter(acc.updatedAt) ? item : acc
  }, null)
  return latestOverride?.updatedAt ?? plan?.createdAt ?? plan?.startDate ?? null
}

const buildSyncSeries = (
  overrides: DayOverride[],
  outputs: CalculationOutputs | undefined,
  plan?: Plan | null,
  baseDayType?: DayType,
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
    )
    const target = getTargetMacros(targetBase)
    const meals = getOverrideMeals(override)
    const totals = meals && meals.length > 0 ? totalsFromMeals(meals) : null

    return {
      date,
      targetKcal: target?.kcal ?? null,
      consumedKcal: totals?.kcal ?? null,
    }
  })
}

const buildTrend = (
  overrides: DayOverride[],
  outputs?: CalculationOutputs | null,
  plan?: Plan | null,
  baseDayType?: DayType,
  baseInputs?: WizardInputs | null,
  days = 7,
): TrendPoint[] => {
  const today = dayjs().startOf('day')
  const latestMealDate = overrides.reduce<Dayjs | null>((acc, item) => {
    const meals = getOverrideMeals(item)
    if (!meals || meals.length === 0) return acc
    const date = dayjs(item.date)
    if (!acc || date.isAfter(acc, 'day')) return date
    return acc
  }, null)
  const baseEndDate = latestMealDate && latestMealDate.isAfter(today, 'day') ? latestMealDate : today
  const planStartValue = plan?.startDate ?? plan?.createdAt
  const planStartDate = planStartValue ? dayjs(planStartValue).startOf('day') : null
  const spanDays = plan?.days ? Math.min(days, plan.days) : days
  let endDate = baseEndDate
  if (planStartDate && plan?.days) {
    const planEndDate = planStartDate.add(plan.days - 1, 'day')
    if (endDate.isAfter(planEndDate, 'day')) {
      endDate = planEndDate
    }
  }
  let startDate = endDate.subtract(spanDays - 1, 'day')
  if (planStartDate && startDate.isBefore(planStartDate, 'day')) {
    startDate = planStartDate
    endDate = planStartDate.add(spanDays - 1, 'day')
  }
  const overrideMap = new Map(overrides.map((item) => [item.date, item]))

  return Array.from({ length: spanDays }, (_, idx) => {
    const date = startDate.add(idx, 'day').format('YYYY-MM-DD')
    const label = dayjs(date).format('D')
    const override = overrideMap.get(date)
    const meals = getOverrideMeals(override)
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
    const baseOutputs = applyPlanMacroOverride(
      override?.computed ?? outputs ?? null,
      plan,
      date,
      dayType,
      trainingType,
      baseInputs?.goal ?? null,
      baseInputs?.weight ?? 0,
      activityDelta,
    )
    const summary = getAdherenceFromMeals(meals, baseOutputs)
    return {
      date,
      label,
      progress: summary.progress,
      state: summary.state,
    }
  })
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

const AdminDashboardPage = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [records, setRecords] = useState<AdminRecord[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviteMaxUses, setInviteMaxUses] = useState(1)
  const [inviteExpires, setInviteExpires] = useState(7)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [goalFilter, setGoalFilter] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [macroDialogOpen, setMacroDialogOpen] = useState(false)
  const [macroSaving, setMacroSaving] = useState(false)
  const [macroError, setMacroError] = useState<string | null>(null)
  const [closePlanOpen, setClosePlanOpen] = useState(false)
  const [closePlanLoading, setClosePlanLoading] = useState(false)
  const [closePlanError, setClosePlanError] = useState<string | null>(null)
  const [macroForm, setMacroForm] = useState({
    protein: '',
    carbsAdjusted: '',
    fatsAdjusted: '',
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [overview, inviteList] = await Promise.all([getAdminOverview(), listInvites()])
        if (!active) return

        setInvites(inviteList)

        const nextRecords = overview.map((item: AdminOverviewItem) => {
          const overrides = item.overrides ?? []
          const outputs = item.assessment?.outputs ?? null
            const overridesWithMeals = overrides.filter((ov) => {
              const meals = getOverrideMeals(ov)
              return !!meals && meals.length > 0
            })
            const latestMealsOverride = overridesWithMeals.sort((a, b) => dayjs(b.updatedAt).diff(a.updatedAt))[0]
            const adherenceDate = latestMealsOverride?.date ?? dayjs().format('YYYY-MM-DD')
            const adherenceDayType = getDayType(latestMealsOverride, item.assessment?.inputs.dayType)
            const adherenceTrainingType = getTrainingType(latestMealsOverride, item.assessment?.inputs ?? null)
            let adherenceDelta = 0
            if (
              item.assessment?.inputs &&
              latestMealsOverride?.overrides?.activityLevel !== undefined &&
              latestMealsOverride?.overrides?.activityLevel !== null
            ) {
              try {
                const baseOverrides = { ...latestMealsOverride.overrides, activityLevel: undefined }
                const baseOutputs = calculateDayFromBase(item.assessment.inputs, baseOverrides)
                const activityOutputs = calculateDayFromBase(item.assessment.inputs, latestMealsOverride.overrides)
                adherenceDelta =
                  (activityOutputs.kcalObjectiveDay ?? 0) - (baseOutputs.kcalObjectiveDay ?? 0)
              } catch {
                adherenceDelta = 0
              }
            }
            const adherenceBase = applyPlanMacroOverride(
              latestMealsOverride?.computed ?? outputs,
              item.plan ?? null,
              adherenceDate,
              adherenceDayType,
              adherenceTrainingType,
              item.assessment?.inputs?.goal ?? null,
              item.assessment?.inputs?.weight ?? 0,
              adherenceDelta,
            )
            const adherence = getAdherenceFromMeals(getOverrideMeals(latestMealsOverride), adherenceBase)

          return {
            userId: item.user.id,
            userName: item.user.name,
            userCreatedAt: item.user.createdAt,
            latestAssessment: item.assessment ?? null,
            plan: item.plan ?? null,
            overrides,
            lastUpdate: getLastUpdateDate(item.plan ?? null, overrides),
            adherence: latestMealsOverride ? { ...adherence, lastDate: latestMealsOverride.date } : adherence,
            trend: buildTrend(
              overrides,
              outputs,
              item.plan ?? null,
              item.assessment?.inputs.dayType,
              item.assessment?.inputs ?? null,
            ),
          }
        })

        setRecords(nextRecords)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return records.filter((record) => {
      const name = record.latestAssessment?.inputs.name ?? record.userName ?? ''
      const goal = record.latestAssessment?.inputs.goal ?? ''
      const status = record.plan?.status ?? 'none'
      const matchesTerm =
        term.length === 0 || name.toLowerCase().includes(term) || record.userId.toLowerCase().includes(term)
      const matchesStatus = statusFilter === 'all' || status === statusFilter
      const matchesGoal = goalFilter === 'all' || goal === goalFilter
      return matchesTerm && matchesStatus && matchesGoal
    })
  }, [records, searchTerm, statusFilter, goalFilter])

  useEffect(() => {
    if (!filteredRecords.length) return
    const selectedExists = selectedUserId
      ? filteredRecords.some((record) => record.userId === selectedUserId)
      : false
    if (!selectedExists) {
      setSelectedUserId(filteredRecords[0].userId)
    }
  }, [filteredRecords, selectedUserId])

  const selectedRecord = records.find((record) => record.userId === selectedUserId) ?? null
  const assessment = selectedRecord?.latestAssessment ?? null
  const canClosePlan = !!selectedRecord?.plan && selectedRecord.plan.status !== 'archived'
  const trendPoints = selectedRecord
    ? [...selectedRecord.trend].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))
    : []
    const syncSeries = useMemo(() => {
      if (!selectedRecord?.plan) return []
      return buildSyncSeries(
        selectedRecord.overrides,
        selectedRecord.latestAssessment?.outputs,
        selectedRecord.plan,
        selectedRecord.latestAssessment?.inputs.dayType,
        selectedRecord.latestAssessment?.inputs ?? null,
      )
    }, [selectedRecord])
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

  const getMacroDefaults = () => {
    const outputs = selectedRecord?.latestAssessment?.outputs
    const plan = selectedRecord?.plan
    if (!outputs && !plan?.macroOverrides?.length) return null
    const todayLabel = dayjs().format('YYYY-MM-DD')
    const override = getPlanMacroOverrideForDate(plan, todayLabel)
    if (override)
      return {
        protein: override.macros.protein,
        carbsAdjusted: override.macros.carbsAdjusted,
        fatsAdjusted: override.macros.fatsAdjusted,
      }
    if (!outputs) return null
    return {
      protein: outputs.protein,
      carbsAdjusted: outputs.carbsAdjusted,
      fatsAdjusted: outputs.fatsAdjusted,
    }
  }

  const parseMacroValue = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numberValue = Number(trimmed)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  const macroPreviewKcal = (() => {
    const protein = parseMacroValue(macroForm.protein)
    const carbsAdjusted = parseMacroValue(macroForm.carbsAdjusted)
    const fatsAdjusted = parseMacroValue(macroForm.fatsAdjusted)
    if (protein === null || carbsAdjusted === null || fatsAdjusted === null) return null
    return calcKcalFromMacros({ protein, carbsAdjusted, fatsAdjusted })
  })()

  const handleOpenMacroDialog = () => {
    setMacroError(null)
    const defaults = getMacroDefaults()
    if (!selectedRecord?.plan || !defaults) {
      setMacroError('No hay datos suficientes para editar macros.')
      setMacroDialogOpen(true)
      return
    }
    setMacroForm({
      protein: Math.round(defaults.protein).toString(),
      carbsAdjusted: Math.round(defaults.carbsAdjusted).toString(),
      fatsAdjusted: Math.round(defaults.fatsAdjusted).toString(),
    })
    setMacroDialogOpen(true)
  }

  const handleCloseMacroDialog = () => {
    if (macroSaving) return
    setMacroDialogOpen(false)
    setMacroError(null)
  }

  const handleSaveMacroOverride = async () => {
    if (!selectedRecord?.plan) return
    const protein = parseMacroValue(macroForm.protein)
    const carbsAdjusted = parseMacroValue(macroForm.carbsAdjusted)
    const fatsAdjusted = parseMacroValue(macroForm.fatsAdjusted)
    if (protein === null || carbsAdjusted === null || fatsAdjusted === null) {
      setMacroError('Completa los campos con numeros validos.')
      return
    }

    setMacroSaving(true)
    setMacroError(null)
    try {
      const plan = await upsertPlanMacroOverride({
        planId: selectedRecord.plan.id,
        effectiveFrom: dayjs().format('YYYY-MM-DD'),
        macros: {
          protein: Math.round(protein),
          carbsAdjusted: Math.round(carbsAdjusted),
          fatsAdjusted: Math.round(fatsAdjusted),
        },
      })
      setRecords((prev) =>
        prev.map((record) =>
          record.plan?.id === plan.id ? { ...record, plan } : record
        )
      )
      setMacroDialogOpen(false)
    } catch (err) {
      setMacroError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setMacroSaving(false)
    }
  }

  const handleOpenClosePlan = () => {
    setClosePlanError(null)
    setClosePlanOpen(true)
  }

  const handleClosePlanDialog = () => {
    if (closePlanLoading) return
    setClosePlanOpen(false)
    setClosePlanError(null)
  }

  const handleConfirmClosePlan = async () => {
    if (!selectedRecord?.plan) return
    setClosePlanLoading(true)
    setClosePlanError(null)
    try {
      const plan = await updatePlanStatus({
        planId: selectedRecord.plan.id,
        status: 'archived',
      })
      setRecords((prev) =>
        prev.map((record) =>
          record.userId === selectedRecord.userId ? { ...record, plan } : record,
        ),
      )
      setClosePlanOpen(false)
    } catch (err) {
      setClosePlanError(err instanceof Error ? err.message : 'No se pudo cerrar el plan')
    } finally {
      setClosePlanLoading(false)
    }
  }

  const inputRows = useMemo(() => {
    if (!assessment) return []
    const { inputs } = assessment
    return [
      { label: 'Nombre', value: formatValue(inputs.name) },
      { label: 'Sexo', value: optionLabel(inputs.sex, sexOptions) },
      { label: 'Edad', value: formatWithUnit(inputs.age, 'anos') },
      { label: 'Peso', value: formatWithUnit(inputs.weight, 'kg') },
      { label: 'Talla', value: formatWithUnit(inputs.height, 'cm') },
      { label: '% Grasa', value: formatWithUnit(inputs.bodyFat ?? null, '%') },
      { label: 'Perfil', value: optionLabel(inputs.profile, profileOptions) },
      { label: 'Actividad', value: optionLabel(inputs.activityLevel, activityOptions) },
      { label: 'Objetivo', value: optionLabel(inputs.goal, goalOptions) },
      { label: 'Tipo de dia', value: optionLabel(inputs.dayType, dayTypeOptions) },
      { label: 'Tipo entreno', value: optionLabel(inputs.trainingType ?? null, trainingOptions) },
      { label: 'Duracion', value: formatWithUnit(inputs.duration ?? null, 'min') },
      { label: 'Training MET', value: formatValue(inputs.trainingMet ?? null) },
    ]
  }, [assessment])

  const outputRows = useMemo<OutputRow[]>(() => {
    if (!assessment) return []
    const { outputs } = assessment
    const dayType = assessment.inputs.dayType ?? 'rest'
    const macroOverride = getPlanMacroOverrideForDate(
      selectedRecord?.plan ?? null,
      dayjs().format('YYYY-MM-DD'),
    )
    const adjustedMacros = macroOverride
      ? (() => {
          const eeeFactor = getEeeFactor(assessment.inputs.goal)
          const kcalObjectiveDay =
            calcKcalFromMacros(macroOverride.macros) + (outputs.eee ?? 0) * eeeFactor
            const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
              protein: macroOverride.macros.protein,
              fats: macroOverride.macros.fatsAdjusted,
              carbs: macroOverride.macros.carbsAdjusted,
              kcalObjectiveDay,
              dayType,
              trainingType: assessment.inputs.trainingType ?? null,
              eee: outputs.eee ?? 0,
              goal: assessment.inputs.goal,
              weight: assessment.inputs.weight,
            })
          return {
            kcalObjectiveDay,
            protein: macroOverride.macros.protein,
            carbsAdjusted,
            fatsAdjusted,
          }
        })()
      : null

    const adjustedValue = (value: number, unit: string) =>
      adjustedMacros ? formatWithUnit(value, unit) : undefined

    return [
      { label: 'RMR', value: formatWithUnit(outputs.rmr, 'kcal') },
      { label: 'PAL', value: formatValue(outputs.pal) },
      { label: 'TDEE', value: formatWithUnit(outputs.tdee, 'kcal') },
      { label: 'Kcal base', value: formatWithUnit(outputs.kcalObjectiveBase, 'kcal') },
      {
        label: 'Proteina',
        value: formatWithUnit(outputs.protein, 'g'),
        adjustedValue: adjustedMacros ? adjustedValue(adjustedMacros.protein, 'g') : undefined,
      },
      { label: 'Grasas', value: formatWithUnit(outputs.fats, 'g') },
      { label: 'Carbs', value: formatWithUnit(outputs.carbs, 'g') },
      { label: 'EEE', value: formatWithUnit(outputs.eee, 'kcal') },
      {
        label: 'Kcal dia',
        value: formatWithUnit(outputs.kcalObjectiveDay, 'kcal'),
        adjustedValue: adjustedMacros ? adjustedValue(adjustedMacros.kcalObjectiveDay, 'kcal') : undefined,
      },
      {
        label: 'Carbs ajustados',
        value: formatWithUnit(outputs.carbsAdjusted, 'g'),
        adjustedValue: adjustedMacros ? adjustedValue(adjustedMacros.carbsAdjusted, 'g') : undefined,
      },
      {
        label: 'Grasas ajustadas',
        value: formatWithUnit(outputs.fatsAdjusted, 'g'),
        adjustedValue: adjustedMacros ? adjustedValue(adjustedMacros.fatsAdjusted, 'g') : undefined,
      },
      { label: 'FFM', value: formatValue(outputs.ffm ?? null) },
      { label: 'EA', value: formatValue(outputs.ea ?? null) },
    ]
  }, [assessment, selectedRecord?.plan])

  const kpis = useMemo(() => {
    const total = records.length
    const activePlans = records.filter((record) => record.plan?.status === 'active').length
    const stale = records.filter((record) => {
      if (!record.lastUpdate) return true
      return dayjs().diff(dayjs(record.lastUpdate), 'day') >= 7
    }).length
    const adherenceValues = records
      .filter((record) => record.adherence.state !== 'none')
      .map((record) => record.adherence.progress)
    const adherenceAvg = adherenceValues.length
      ? Math.round(adherenceValues.reduce((acc, value) => acc + value, 0) / adherenceValues.length)
      : null

    return { total, activePlans, stale, adherenceAvg }
  }, [records])

  const getAdherenceColor = (state: AdherenceState) => {
    if (state === 'ok') return theme.palette.success.main
    if (state === 'over') return theme.palette.error.main
    if (state === 'pending') return theme.palette.warning.main
    return theme.palette.grey[400]
  }

  const renderProgress = (progress: number, state: AdherenceState) => (
    <LinearProgress
      variant="determinate"
      value={progress}
      sx={{
        height: 6,
        borderRadius: 999,
        bgcolor: theme.palette.grey[200],
        '& .MuiLinearProgress-bar': {
          bgcolor: getAdherenceColor(state),
        },
      }}
    />
  )

  const handleCreateInvite = async () => {
    setCreatingInvite(true)
    setInviteError(null)
    setInviteCode(null)
    try {
      const maxUses = Number.isFinite(inviteMaxUses) ? inviteMaxUses : 1
      const expiresInDays = Number.isFinite(inviteExpires) ? inviteExpires : 7
      const result = await createInvite({
        role: inviteRole,
        maxUses,
        expiresInDays,
      })
      setInvites((prev) => [result.invite, ...prev])
      setInviteCode(result.code)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'No se pudo crear el codigo')
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleCopyCode = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
    } catch {
      setInviteError('No se pudo copiar el codigo')
    }
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
          <Paper
            variant="outlined"
            sx={{
              width: { xs: '100%', md: 220 },
              position: { md: 'sticky' },
              top: 24,
            }}
          >
            <List disablePadding sx={{ display: 'flex', flexDirection: { xs: 'row', md: 'column' } }}>
              {ADMIN_SECTIONS.map((item) => (
                <ListItemButton
                  key={item.id}
                  selected={activeSection === item.id}
                  onClick={() => setActiveSection(item.id)}
                  sx={{ flex: { xs: 1, md: 'initial' } }}
                >
                  <ListItemText primary={item.label} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {activeSection === 'overview' ? (
              <Stack spacing={3}>
                <Box>
                  <Typography variant="h4" fontWeight={800} gutterBottom>
                    Administrador
                  </Typography>
                  <Typography color="text.secondary">
                    Informacion global de socios, planes y evolucion nutricional.
                  </Typography>
                </Box>

                {error && <Alert severity="warning">{error}</Alert>}

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {loading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} elevation={0} sx={{ flex: 1 }}>
                <CardContent>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card elevation={0} sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Total socios
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {kpis.total}
                  </Typography>
                </CardContent>
              </Card>
              <Card elevation={0} sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Planes activos
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {kpis.activePlans}
                  </Typography>
                </CardContent>
              </Card>
              <Card elevation={0} sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Sin update +30 dias
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {kpis.stale}
                  </Typography>
                </CardContent>
              </Card>
              <Card elevation={0} sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Adherencia promedio
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {kpis.adherenceAvg !== null ? `${kpis.adherenceAvg}%` : '--'}
                  </Typography>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>

        <Card elevation={0}>
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Invitaciones
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Genera codigos unicos para nuevos socios.
                  </Typography>
                </Box>
                <Button variant="contained" onClick={handleCreateInvite} disabled={creatingInvite}>
                  {creatingInvite ? 'Generando...' : 'Generar codigo'}
                </Button>
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Rol</InputLabel>
                  <Select
                    value={inviteRole}
                    label="Rol"
                    onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')}
                  >
                    <MenuItem value="member">Socio</MenuItem>
                    <MenuItem value="admin">Admin</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Usos"
                  type="number"
                  fullWidth
                  value={inviteMaxUses}
                  onChange={(event) => setInviteMaxUses(Number(event.target.value))}
                  inputProps={{ min: 1, max: 50 }}
                />
                <TextField
                  label="Expira en dias"
                  type="number"
                  fullWidth
                  value={inviteExpires}
                  onChange={(event) => setInviteExpires(Number(event.target.value))}
                  inputProps={{ min: 1, max: 365 }}
                />
              </Stack>

              {inviteError && <Alert severity="warning">{inviteError}</Alert>}
              {inviteCode && (
                <Alert
                  severity="success"
                  action={
                    <Button color="inherit" size="small" onClick={handleCopyCode}>
                      Copiar
                    </Button>
                  }
                >
                  Codigo generado: <strong>{inviteCode}</strong>
                </Alert>
              )}

              <Divider />

              <Paper variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Codigo</TableCell>
                      <TableCell>Rol</TableCell>
                      <TableCell>Usos</TableCell>
                      <TableCell>Expira</TableCell>
                      <TableCell>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading &&
                      Array.from({ length: 3 }).map((_, idx) => (
                        <TableRow key={idx}>
                          <TableCell colSpan={5}>
                            <Skeleton variant="rectangular" height={32} />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!loading && invites.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <Typography variant="body2" color="text.secondary">
                            Sin codigos creados.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading &&
                      invites.map((invite) => (
                        <TableRow key={invite.id}>
                          <TableCell>{`****-${invite.codeSuffix}`}</TableCell>
                          <TableCell>{invite.role === 'admin' ? 'Admin' : 'Socio'}</TableCell>
                          <TableCell>
                            {invite.usesCount}/{invite.maxUses}
                          </TableCell>
                          <TableCell>
                            {invite.expiresAt ? dayjs(invite.expiresAt).format('DD MMM YYYY') : '--'}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={invite.status}
                              color={INVITE_STATUS_COLORS[invite.status] ?? 'default'}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          </CardContent>
        </Card>

        <Card elevation={0}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Buscar"
                placeholder="Nombre o userId"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(event.target.value)}>
                  <MenuItem value="all">Todos</MenuItem>
                  <MenuItem value="active">Activo</MenuItem>
                  <MenuItem value="draft">Borrador</MenuItem>
                  <MenuItem value="archived">Archivado</MenuItem>
                  <MenuItem value="none">Sin plan</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Objetivo</InputLabel>
                <Select value={goalFilter} label="Objetivo" onChange={(event) => setGoalFilter(event.target.value)}>
                  <MenuItem value="all">Todos</MenuItem>
                  <MenuItem value="fat_loss">Perdida grasa</MenuItem>
                  <MenuItem value="muscle_gain">Ganancia muscular</MenuItem>
                  <MenuItem value="recomp">Recomposicion</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems="flex-start">
          <Paper sx={{ flex: 2, width: '100%' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Socio</TableCell>
                  <TableCell>Incorporacion</TableCell>
                  <TableCell>Plan activo</TableCell>
                  <TableCell>Objetivo</TableCell>
                  <TableCell>Ultima actualizacion</TableCell>
                  <TableCell>Adherencia</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading &&
                  Array.from({ length: 4 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell colSpan={6}>
                        <Skeleton variant="rectangular" height={36} />
                      </TableCell>
                    </TableRow>
                  ))}

                {!loading && filteredRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Alert severity="info">No hay socios con esos filtros.</Alert>
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  filteredRecords.map((record) => {
                    const status = record.plan?.status ?? 'none'
                    const goal = record.latestAssessment?.inputs.goal
                    const statusLabel = STATUS_LABELS[status] ?? 'Sin plan'
                    const statusColor = STATUS_COLORS[status] ?? 'default'
                    const planLabel = getPlanLabel(record.plan)
                    const createdAt = record.userCreatedAt ? dayjs(record.userCreatedAt).format('DD MMM YYYY') : '--'
                    const lastUpdate = record.lastUpdate ? dayjs(record.lastUpdate).format('DD MMM YYYY') : '--'
                    const adherence = record.adherence
                    const adherenceChipColor =
                      adherence.state === 'ok'
                        ? 'success'
                        : adherence.state === 'over'
                          ? 'error'
                          : adherence.state === 'pending'
                            ? 'warning'
                            : 'default'
                    const name = record.latestAssessment?.inputs.name ?? record.userName ?? 'Sin nombre'

                    return (
                      <TableRow
                        key={record.userId}
                        hover
                        selected={record.userId === selectedUserId}
                        onClick={() => setSelectedUserId(record.userId)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography fontWeight={700}>{name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {record.userId}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{createdAt}</TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography variant="body2" fontWeight={600}>
                              {planLabel}
                            </Typography>
                            <Chip size="small" label={statusLabel} color={statusColor} />
                          </Stack>
                        </TableCell>
                        <TableCell>{goal ? GOAL_LABELS[goal] ?? goal : '--'}</TableCell>
                        <TableCell>{lastUpdate}</TableCell>
                        <TableCell>
                          <Stack spacing={0.75}>
                            <Chip size="small" label={adherence.label} color={adherenceChipColor} />
                            {renderProgress(adherence.progress, adherence.state)}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(event) => {
                                event.stopPropagation()
                                if (record.plan) navigate(`/plans/${record.plan.id}`)
                              }}
                              disabled={!record.plan}
                            >
                              Abrir
                            </Button>
                            <Button size="small" variant="text" onClick={(event) => event.stopPropagation()}>
                              Seguimiento
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </Paper>

          <Card elevation={0} sx={{ flex: 1, width: '100%', position: 'sticky', top: 24 }}>
            <CardContent>
              {loading ? (
                <Stack spacing={2}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="rectangular" height={120} />
                  <Skeleton variant="rectangular" height={120} />
                </Stack>
              ) : !selectedRecord ? (
                <Typography color="text.secondary">Selecciona un socio para ver detalle.</Typography>
              ) : (
                <Stack spacing={2}>
                  <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={800}>
                      {selectedRecord.latestAssessment?.inputs.name ?? selectedRecord.userName ?? 'Sin nombre'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedRecord.userId}
                    </Typography>
                      {selectedRecord.plan && (
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="body2">{getPlanLabel(selectedRecord.plan)}</Typography>
                          <Button size="small" variant="outlined" onClick={handleOpenMacroDialog}>
                            Editar macros
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={handleOpenClosePlan}
                            disabled={!canClosePlan}
                          >
                            Cerrar plan
                          </Button>
                        </Stack>
                      )}
                    </Stack>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Evaluacion completa
                    </Typography>
                    {assessment ? (
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                            Inputs
                          </Typography>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))' },
                              gap: 1.25,
                            }}
                          >
                            {inputRows.map((row) => (
                              <Stack key={row.label} spacing={0.25}>
                                <Typography variant="caption" color="text.secondary">
                                  {row.label}
                                </Typography>
                                <Typography fontWeight={700}>{row.value}</Typography>
                              </Stack>
                            ))}
                          </Box>
                        </Box>

                        <Box>
                          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                            Outputs
                          </Typography>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))' },
                              gap: 1.25,
                            }}
                          >
                            {outputRows.map((row) => (
                              <Stack key={row.label} spacing={0.25}>
                                <Typography variant="caption" color="text.secondary">
                                  {row.label}
                                </Typography>
                                <Typography fontWeight={700}>{row.value}</Typography>
                                {row.adjustedValue && (
                                  <Typography variant="caption" sx={{ color: theme.palette.success.main }}>
                                    Ajustado por admin: {row.adjustedValue}
                                  </Typography>
                                )}
                              </Stack>
                            ))}
                          </Box>
                        </Box>
                      </Stack>
                    ) : (
                      <Alert severity="info">Sin evaluacion disponible.</Alert>
                    )}
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Consumo de calorias
                    </Typography>
                    {!hasTargetData ? (
                      <Stack spacing={1}>
                        <Typography variant="subtitle2" fontWeight={700}>
                          Sin datos del plan
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Aun no hay objetivos disponibles para graficar.
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack spacing={2}>
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
                      </Stack>
                    )}
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Tendencia ultima semana
                    </Typography>
                    <Stack spacing={1}>
                      {trendPoints.map((point) => (
                        <Stack key={point.date} direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" sx={{ width: 28 }}>
                            {point.label}
                          </Typography>
                          <Box flex={1}>{renderProgress(point.progress, point.state)}</Box>
                          <Typography variant="caption" color="text.secondary" sx={{ width: 32 }}>
                            {point.progress}%
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>

                  <Divider />

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => selectedRecord.plan && navigate(`/plans/${selectedRecord.plan.id}`)}
                      disabled={!selectedRecord.plan}
                      fullWidth
                    >
                      Abrir plan
                    </Button>
                    <Button variant="outlined" fullWidth>
                      Marcar seguimiento
                    </Button>
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Stack>
              </Stack>
              ) : (
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="h4" fontWeight={800} gutterBottom>
                      Ingredientes
                    </Typography>
                    <Typography color="text.secondary">
                      Gestiona el catalogo de ingredientes, porciones y estado operativo.
                    </Typography>
                  </Box>
                  <AdminIngredientsSection />
                </Stack>
              )}
            </Box>
          </Stack>
        </Stack>

      <Dialog open={closePlanOpen} onClose={handleClosePlanDialog} fullWidth maxWidth="xs">
        <DialogTitle>Cerrar plan</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2">
              Este plan quedara como archivado. El cliente sera enviado al wizard en su proximo ingreso para
              crear un nuevo plan.
            </Typography>
            {closePlanError && <Alert severity="warning">{closePlanError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePlanDialog} disabled={closePlanLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConfirmClosePlan}
            disabled={!canClosePlan || closePlanLoading}
          >
            {closePlanLoading ? 'Cerrando...' : 'Cerrar plan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={macroDialogOpen} onClose={handleCloseMacroDialog} fullWidth maxWidth="xs">
        <DialogTitle>Editar macros del plan</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Aplica desde hoy y no modifica dias anteriores.
            </Typography>
            <TextField
              size="small"
              type="number"
              label="Kcal objetivo (dia)"
              value={macroPreviewKcal ?? ''}
              InputProps={{ readOnly: true }}
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Proteina (g)"
              value={macroForm.protein}
              onChange={(event) =>
                setMacroForm((prev) => ({ ...prev, protein: event.target.value }))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Carbohidratos ajustados (g)"
              value={macroForm.carbsAdjusted}
              onChange={(event) =>
                setMacroForm((prev) => ({ ...prev, carbsAdjusted: event.target.value }))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Grasas ajustadas (g)"
              value={macroForm.fatsAdjusted}
              onChange={(event) =>
                setMacroForm((prev) => ({ ...prev, fatsAdjusted: event.target.value }))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            {macroError && <Alert severity="warning">{macroError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMacroDialog}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveMacroOverride} disabled={macroSaving}>
            {macroSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

export default AdminDashboardPage
