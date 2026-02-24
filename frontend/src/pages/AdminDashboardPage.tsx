import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Badge,
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
  IconButton,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import CakeRoundedIcon from '@mui/icons-material/CakeRounded'
import DirectionsWalkRoundedIcon from '@mui/icons-material/DirectionsWalkRounded'
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded'
import FlagRoundedIcon from '@mui/icons-material/FlagRounded'
import HeightRoundedIcon from '@mui/icons-material/HeightRounded'
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded'
import MonitorWeightRoundedIcon from '@mui/icons-material/MonitorWeightRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import PercentRoundedIcon from '@mui/icons-material/PercentRounded'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  createAdminPasswordReset,
  createInvite,
  getAdminUnreadMessageCounts,
  getAdminUserMessages,
  getAdminOverview,
  listInvites,
  sendAdminMessage,
  upsertOverride,
  type AppMessage,
  type AdminOverviewItem,
  type Invite,
  upsertPlanMacroOverride,
  updateUserStatus,
  updatePlanStatus,
} from '../lib/api'
import {
  applyMacroOverrideToOutputs,
  calcKcalFromMacros,
  calculateDayFromBase,
  getMacroKcalBreakdown,
  toMacroPortions,
} from '../lib/calc'
import AdminIngredientsSection from '../components/AdminIngredientsSection'
import WeeklyIntakeCard from '../components/WeeklyIntakeCard'
import {
  activityOptions,
  dayTypeOptions,
  goalOptions,
  profileOptions,
  sexOptions,
  trainingOptions,
} from '../lib/schema'
import { getMacroState, type MacroState } from '../lib/macroStatus'
import type { WeeklyDataPoint } from '../lib/weeklyTracking'
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
  targetMacros: MacroSummary | null
  consumedMacros: MacroSummary | null
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
  userStatus: 'active' | 'disabled'
  latestAssessment?: Assessment | null
  plan?: Plan | null
  overrides: DayOverride[]
  lastUpdate?: string | null
  adherence: AdherenceSummary
  trend: TrendPoint[]
}

type AdminSection = 'overview' | 'ingredients'

const GOAL_LABELS: Record<string, string> = {
  fat_loss: 'Perdida grasa',
  muscle_gain: 'Ganancia muscular',
  recomp: 'Recomposicion',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  draft: 'En revision',
  archived: 'Archivado',
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  draft: 'warning',
  archived: 'default',
}

const USER_STATUS_LABELS: Record<'active' | 'disabled', string> = {
  active: 'Activo',
  disabled: 'Bloqueado',
}

const USER_STATUS_COLORS: Record<'active' | 'disabled', 'success' | 'error'> = {
  active: 'success',
  disabled: 'error',
}

const INVITE_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  disabled: 'warning',
  expired: 'error',
  consumed: 'default',
}
const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
const MESSAGES_ENABLED = `${import.meta.env.VITE_MESSAGES_ENABLED ?? ''}`.toLowerCase() === 'true'

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
  return plan.title ?? `Planificacion 1`
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

const toPortions = (macros: { protein: number; carbs: number; fat: number }) => toMacroPortions(macros)

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
      override,
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

type AdminDashboardPageProps = {
  mode?: 'overview' | 'client-detail'
}

const AdminDashboardPage = ({ mode = 'overview' }: AdminDashboardPageProps) => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userId: routeUserId } = useParams<{ userId: string }>()
  const isClientDetailMode = mode === 'client-detail'
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
  const activeSection: AdminSection =
    searchParams.get('section') === 'ingredients' ? 'ingredients' : 'overview'
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [goalFilter, setGoalFilter] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [macroDialogOpen, setMacroDialogOpen] = useState(false)
  const [macroSaving, setMacroSaving] = useState(false)
  const [macroError, setMacroError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [userStatusLoading, setUserStatusLoading] = useState(false)
  const [userStatusError, setUserStatusError] = useState<string | null>(null)
  const [resetPayload, setResetPayload] = useState<{
    token: string
    resetUrl: string
    expiresAt: string
    email: string
  } | null>(null)
  const [closePlanOpen, setClosePlanOpen] = useState(false)
  const [closePlanLoading, setClosePlanLoading] = useState(false)
  const [closePlanError, setClosePlanError] = useState<string | null>(null)
  const [enablePlanLoading, setEnablePlanLoading] = useState(false)
  const [enablePlanError, setEnablePlanError] = useState<string | null>(null)
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<null | HTMLElement>(null)
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [messageTarget, setMessageTarget] = useState<{ userId: string; name: string } | null>(null)
  const [messageText, setMessageText] = useState('')
  const [messageItems, setMessageItems] = useState<AppMessage[]>([])
  const [messageNextBefore, setMessageNextBefore] = useState<string | null>(null)
  const [messageLoading, setMessageLoading] = useState(false)
  const [messageLoadingMore, setMessageLoadingMore] = useState(false)
  const [messageSending, setMessageSending] = useState(false)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<string, number>>({})
  const [trackingWindowPage, setTrackingWindowPage] = useState(0)
  const [macroForm, setMacroForm] = useState({
    protein: '',
    carbsAdjusted: '',
    fatsAdjusted: '',
  })
  const [dayMacroDialogOpen, setDayMacroDialogOpen] = useState(false)
  const [dayMacroSaving, setDayMacroSaving] = useState(false)
  const [dayMacroError, setDayMacroError] = useState<string | null>(null)
  const [dayMacroDate, setDayMacroDate] = useState<string | null>(null)
  const [dayMacroForm, setDayMacroForm] = useState({
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
        const unreadCountsPromise = MESSAGES_ENABLED
          ? getAdminUnreadMessageCounts().catch(() => ({} as Record<string, number>))
          : Promise.resolve({})
        const [overview, inviteList, unreadCounts] = await Promise.all([
          getAdminOverview(),
          listInvites(),
          unreadCountsPromise,
        ])
        if (!active) return

        setInvites(inviteList)
        setUnreadMessageCounts(unreadCounts)

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
              latestMealsOverride,
            )
            const adherence = getAdherenceFromMeals(getOverrideMeals(latestMealsOverride), adherenceBase)

          return {
            userId: item.user.id,
            userName: item.user.name,
            userCreatedAt: item.user.createdAt,
            userStatus: item.user.status,
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

  const selectedRecordId = isClientDetailMode ? routeUserId ?? null : selectedUserId
  const selectedRecord = records.find((record) => record.userId === selectedRecordId) ?? null
  const assessment = selectedRecord?.latestAssessment ?? null
  useEffect(() => {
    setActionsMenuAnchor(null)
  }, [selectedRecordId])
  const canEnablePlan = selectedRecord?.plan?.status === 'draft'
  const canClosePlan = !!selectedRecord?.plan && selectedRecord.plan.status !== 'archived'
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
  const fullPlanIntakeData = useMemo(
    () =>
      syncSeries.map((item) => {
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
    [syncSeries],
  )
  const hasTargetData = fullPlanIntakeData.some((item) => item.caloriesTarget > 0)
  const trackingWindowSize = 7
  const totalTrackingPages = Math.max(1, Math.ceil(fullPlanIntakeData.length / trackingWindowSize))
  const safeTrackingPage = Math.min(trackingWindowPage, totalTrackingPages - 1)
  const trackingWindowStart = safeTrackingPage * trackingWindowSize
  const trackingWindowEnd = Math.min(trackingWindowStart + trackingWindowSize, fullPlanIntakeData.length)
  const trackingWindowData = fullPlanIntakeData.slice(trackingWindowStart, trackingWindowEnd)
  const selectedOverridesByDate = useMemo(
    () => new Map((selectedRecord?.overrides ?? []).map((item) => [item.date, item])),
    [selectedRecord?.overrides],
  )
  const hasSelectedDayMacroOverride = (day: WeeklyDataPoint) =>
    !!selectedOverridesByDate.get(day.date)?.overrides?.macroOverride

  useEffect(() => {
    setTrackingWindowPage(0)
  }, [selectedRecord?.plan?.id])

  useEffect(() => {
    if (trackingWindowPage > totalTrackingPages - 1) {
      setTrackingWindowPage(Math.max(0, totalTrackingPages - 1))
    }
  }, [totalTrackingPages, trackingWindowPage])
  const selectedPatientName = selectedRecord?.latestAssessment?.inputs.name ?? selectedRecord?.userName ?? 'Sin nombre'
  const selectedPlanDate = selectedRecord?.plan?.startDate
    ? dayjs(selectedRecord.plan.startDate).format('DD MMM YYYY')
    : '--'
  const actionsMenuOpen = Boolean(actionsMenuAnchor)
  const effectiveOutputs = useMemo<CalculationOutputs | null>(() => {
    if (!assessment) return null
    const { outputs, inputs } = assessment
    const macroOverride = getPlanMacroOverrideForDate(
      selectedRecord?.plan ?? null,
      dayjs().format('YYYY-MM-DD'),
    )
    if (!macroOverride) return outputs
    return applyMacroOverrideToOutputs({
      outputs,
      overrideMacros: macroOverride.macros,
      dayType: inputs.dayType ?? 'rest',
      trainingType: inputs.trainingType ?? null,
      goal: inputs.goal,
      weight: inputs.weight,
    })
  }, [assessment, selectedRecord?.plan])
  const macroDistribution = useMemo(() => {
    if (!effectiveOutputs) return []
    const macros = {
      protein: effectiveOutputs.protein,
      carbs: effectiveOutputs.carbsAdjusted,
      fat: effectiveOutputs.fatsAdjusted,
    }
    const breakdown = getMacroKcalBreakdown(macros)
    if (breakdown.totalKcal <= 0) return []
    const toPercent = (kcal: number) => Math.round((kcal / breakdown.totalKcal) * 100)
    return [
      {
        id: 'protein',
        label: 'Proteina',
        grams: macros.protein,
        percent: toPercent(breakdown.proteinKcal),
        color: theme.palette.success.main,
      },
      {
        id: 'carbs',
        label: 'Carbohidratos',
        grams: macros.carbs,
        percent: toPercent(breakdown.carbsKcal),
        color: theme.palette.info.main,
      },
      {
        id: 'fat',
        label: 'Grasas',
        grams: macros.fat,
        percent: toPercent(breakdown.fatKcal),
        color: theme.palette.warning.main,
      },
    ]
  }, [effectiveOutputs, theme])
  const profilePhysicalRows = useMemo(() => {
    if (!assessment) return []
    const { inputs } = assessment
    return [
      {
        label: 'Edad',
        value: formatWithUnit(inputs.age, 'años'),
        icon: <CakeRoundedIcon fontSize="small" color="action" />,
      },
      {
        label: 'Peso',
        value: formatWithUnit(inputs.weight, 'kg'),
        icon: <MonitorWeightRoundedIcon fontSize="small" color="action" />,
      },
      {
        label: 'Talla',
        value: formatWithUnit(inputs.height, 'cm'),
        icon: <HeightRoundedIcon fontSize="small" color="action" />,
      },
      {
        label: '% Grasa',
        value: formatWithUnit(inputs.bodyFat ?? null, '%'),
        icon: <PercentRoundedIcon fontSize="small" color="action" />,
      },
    ]
  }, [assessment])
  const profileContextRows = useMemo(() => {
    if (!assessment) return []
    const { inputs } = assessment
    return [
      {
        label: 'Objetivo',
        value: optionLabel(inputs.goal, goalOptions),
        icon: <FlagRoundedIcon fontSize="small" color="action" />,
      },
      {
        label: 'Nivel actividad',
        value: optionLabel(inputs.activityLevel, activityOptions),
        icon: <DirectionsWalkRoundedIcon fontSize="small" color="action" />,
      },
      {
        label: 'Tipo de dia',
        value: optionLabel(inputs.dayType, dayTypeOptions),
        icon: <EventRepeatRoundedIcon fontSize="small" color="action" />,
      },
      {
        label: 'Perfil',
        value: optionLabel(inputs.profile, profileOptions),
        icon: <PersonOutlineRoundedIcon fontSize="small" color="action" />,
      },
    ]
  }, [assessment])

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

  const dayMacroPreviewKcal = (() => {
    const protein = parseMacroValue(dayMacroForm.protein)
    const carbsAdjusted = parseMacroValue(dayMacroForm.carbsAdjusted)
    const fatsAdjusted = parseMacroValue(dayMacroForm.fatsAdjusted)
    if (protein === null || carbsAdjusted === null || fatsAdjusted === null) return null
    return calcKcalFromMacros({ protein, carbsAdjusted, fatsAdjusted })
  })()

  const applyDayOverrideUpdate = (targetUserId: string, nextOverride: DayOverride) => {
    setRecords((prev) =>
      prev.map((record) => {
        if (record.userId !== targetUserId) return record
        const existingIndex = record.overrides.findIndex((item) => item.date === nextOverride.date)
        if (existingIndex < 0) {
          return {
            ...record,
            overrides: [...record.overrides, nextOverride],
            lastUpdate: nextOverride.updatedAt,
          }
        }
        return {
          ...record,
          overrides: record.overrides.map((item, index) =>
            index === existingIndex ? nextOverride : item,
          ),
          lastUpdate: nextOverride.updatedAt,
        }
      }),
    )
  }

  const handleOpenActionsMenu = (event: MouseEvent<HTMLElement>) => {
    setActionsMenuAnchor(event.currentTarget)
  }

  const handleCloseActionsMenu = () => {
    setActionsMenuAnchor(null)
  }

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

  const handleOpenDayMacroDialog = (day: WeeklyDataPoint) => {
    if (!selectedRecord?.plan) return
    const existingDayOverride = selectedOverridesByDate.get(day.date)
    const defaults = existingDayOverride?.overrides?.macroOverride ?? {
      protein: day.proteinTargetG,
      carbsAdjusted: day.carbsTargetG,
      fatsAdjusted: day.fatsTargetG,
    }
    setDayMacroDate(day.date)
    setDayMacroError(null)
    setDayMacroForm({
      protein: Math.round(defaults.protein).toString(),
      carbsAdjusted: Math.round(defaults.carbsAdjusted).toString(),
      fatsAdjusted: Math.round(defaults.fatsAdjusted).toString(),
    })
    setDayMacroDialogOpen(true)
  }

  const handleCloseDayMacroDialog = () => {
    if (dayMacroSaving) return
    setDayMacroDialogOpen(false)
    setDayMacroDate(null)
    setDayMacroError(null)
  }

  const handleSaveDayMacroOverride = async () => {
    if (!selectedRecord?.plan || !dayMacroDate) return
    const protein = parseMacroValue(dayMacroForm.protein)
    const carbsAdjusted = parseMacroValue(dayMacroForm.carbsAdjusted)
    const fatsAdjusted = parseMacroValue(dayMacroForm.fatsAdjusted)
    if (protein === null || carbsAdjusted === null || fatsAdjusted === null) {
      setDayMacroError('Completa los campos con numeros validos.')
      return
    }

    const existingDayOverride = selectedOverridesByDate.get(dayMacroDate)
    const baseDayType = selectedRecord.latestAssessment?.inputs.dayType ?? 'rest'
    const baseActivityLevel = selectedRecord.latestAssessment?.inputs.activityLevel

    setDayMacroSaving(true)
    setDayMacroError(null)
    try {
      const updatedOverride = await upsertOverride({
        planId: selectedRecord.plan.id,
        date: dayMacroDate,
        overrides: {
          ...(existingDayOverride?.overrides ?? {
            dayType: baseDayType,
            activityLevel: baseActivityLevel,
          }),
          macroOverride: {
            protein: Math.round(protein),
            carbsAdjusted: Math.round(carbsAdjusted),
            fatsAdjusted: Math.round(fatsAdjusted),
          },
        },
        meals: existingDayOverride?.meals,
        note: existingDayOverride?.note,
      })
      applyDayOverrideUpdate(selectedRecord.userId, updatedOverride)
      setDayMacroDialogOpen(false)
      setDayMacroDate(null)
    } catch (err) {
      setDayMacroError(err instanceof Error ? err.message : 'No se pudo guardar ajuste diario')
    } finally {
      setDayMacroSaving(false)
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

  const handleEnablePlan = async () => {
    if (!selectedRecord?.plan) return
    setEnablePlanLoading(true)
    setEnablePlanError(null)
    try {
      const plan = await updatePlanStatus({
        planId: selectedRecord.plan.id,
        status: 'active',
      })
      setRecords((prev) =>
        prev.map((record) =>
          record.userId === selectedRecord.userId ? { ...record, plan } : record,
        ),
      )
    } catch (err) {
      setEnablePlanError(err instanceof Error ? err.message : 'No se pudo habilitar el plan')
    } finally {
      setEnablePlanLoading(false)
    }
  }

  const handleToggleUserStatus = async () => {
    if (!selectedRecord) return
    const nextStatus = selectedRecord.userStatus === 'active' ? 'disabled' : 'active'
    setUserStatusLoading(true)
    setUserStatusError(null)
    try {
      const updated = await updateUserStatus(selectedRecord.userId, nextStatus)
      setRecords((prev) =>
        prev.map((record) =>
          record.userId === selectedRecord.userId ? { ...record, userStatus: updated.status } : record,
        ),
      )
    } catch (err) {
      setUserStatusError(err instanceof Error ? err.message : 'No se pudo actualizar el estado del usuario')
    } finally {
      setUserStatusLoading(false)
    }
  }

  const handleOpenResetDialog = async () => {
    if (!selectedRecord) return
    setResetDialogOpen(true)
    setResetError(null)
    setResetPayload(null)
    setResetLoading(true)
    try {
      const payload = await createAdminPasswordReset(selectedRecord.userId)
      setResetPayload(payload)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'No se pudo generar el enlace')
    } finally {
      setResetLoading(false)
    }
  }

  const handleCloseResetDialog = () => {
    if (resetLoading) return
    setResetDialogOpen(false)
    setResetError(null)
    setResetPayload(null)
  }

  const handleCopyReset = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setResetError('No se pudo copiar al portapapeles')
    }
  }

  const inputRows = useMemo(() => {
    if (!assessment) return []
    const { inputs } = assessment
    return [
      { label: 'Nombre', value: formatValue(inputs.name) },
      { label: 'Sexo', value: optionLabel(inputs.sex, sexOptions) },
      { label: 'Edad', value: formatWithUnit(inputs.age, 'años') },
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
          const nextOutputs = applyMacroOverrideToOutputs({
            outputs,
            overrideMacros: macroOverride.macros,
            dayType,
            trainingType: assessment.inputs.trainingType ?? null,
            goal: assessment.inputs.goal,
            weight: assessment.inputs.weight,
          })
          return {
            kcalObjectiveDay: nextOutputs.kcalObjectiveDay,
            protein: nextOutputs.protein,
            carbsAdjusted: nextOutputs.carbsAdjusted,
            fatsAdjusted: nextOutputs.fatsAdjusted,
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

  const loadMessageThread = async (
    userId: string,
    options?: { append?: boolean; before?: string | null },
  ) => {
    const append = options?.append ?? false
    if (append) setMessageLoadingMore(true)
    else setMessageLoading(true)
    setMessageError(null)
    try {
      const result = await getAdminUserMessages(userId, {
        limit: 20,
        before: options?.before ?? undefined,
      })
      if (append) {
        setMessageItems((prev) => [...prev, ...result.messages])
      } else {
        setMessageItems(result.messages)
      }
      setMessageNextBefore(result.nextBefore ?? null)
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : 'No se pudieron cargar mensajes')
    } finally {
      if (append) setMessageLoadingMore(false)
      else setMessageLoading(false)
    }
  }

  const handleOpenMessageDialog = (target: { userId: string; name: string }) => {
    setMessageDialogOpen(true)
    setMessageTarget(target)
    setMessageText('')
    setMessageItems([])
    setMessageNextBefore(null)
    setMessageError(null)
    if (MESSAGES_ENABLED) {
      void getAdminUnreadMessageCounts()
        .then((counts) => setUnreadMessageCounts(counts))
        .catch(() => undefined)
    }
    void loadMessageThread(target.userId)
  }

  const handleCloseMessageDialog = () => {
    if (messageSending) return
    setMessageDialogOpen(false)
    setMessageTarget(null)
    setMessageText('')
    setMessageItems([])
    setMessageNextBefore(null)
    setMessageError(null)
  }

  const handleSendMessage = async () => {
    if (!messageTarget) return
    const body = messageText.trim()
    if (!body) {
      setMessageError('Escribe un mensaje para enviar')
      return
    }
    setMessageSending(true)
    setMessageError(null)
    try {
      const message = await sendAdminMessage(messageTarget.userId, body)
      setMessageItems((prev) => [message, ...prev])
      setUnreadMessageCounts((prev) => ({
        ...prev,
        [messageTarget.userId]: (prev[messageTarget.userId] ?? 0) + 1,
      }))
      setMessageText('')
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje')
    } finally {
      setMessageSending(false)
    }
  }

  const handleLoadMoreMessages = () => {
    if (!messageTarget || !messageNextBefore) return
    void loadMessageThread(messageTarget.userId, { append: true, before: messageNextBefore })
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Box sx={{ minWidth: 0 }}>
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

                {!isClientDetailMode && (
                  <>
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
                            <Select
                              value={statusFilter}
                              label="Status"
                              onChange={(event) => setStatusFilter(event.target.value)}
                            >
                              <MenuItem value="all">Todos</MenuItem>
                              <MenuItem value="active">Activo</MenuItem>
                              <MenuItem value="draft">En revision</MenuItem>
                              <MenuItem value="archived">Archivado</MenuItem>
                              <MenuItem value="none">Sin plan</MenuItem>
                            </Select>
                          </FormControl>
                          <FormControl fullWidth>
                            <InputLabel>Objetivo</InputLabel>
                            <Select
                              value={goalFilter}
                              label="Objetivo"
                              onChange={(event) => setGoalFilter(event.target.value)}
                            >
                              <MenuItem value="all">Todos</MenuItem>
                              <MenuItem value="fat_loss">Perdida grasa</MenuItem>
                              <MenuItem value="muscle_gain">Ganancia muscular</MenuItem>
                              <MenuItem value="recomp">Recomposicion</MenuItem>
                            </Select>
                          </FormControl>
                        </Stack>
                      </CardContent>
                    </Card>
                  </>
                )}

        {isClientDetailMode && (
          <Button variant="outlined" onClick={() => navigate('/admin')} sx={{ alignSelf: 'flex-start' }}>
            Volver al listado
          </Button>
        )}

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems="flex-start">
          {!isClientDetailMode && (
          <Paper sx={{ flex: { lg: 2.2 }, width: '100%', minWidth: 0 }}>
            <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
              <Table sx={{ minWidth: 880 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Socio</TableCell>
                  <TableCell>Cuenta</TableCell>
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
                      <TableCell colSpan={8}>
                        <Skeleton variant="rectangular" height={36} />
                      </TableCell>
                    </TableRow>
                  ))}

                {!loading && filteredRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Alert severity="info">No hay socios con esos filtros.</Alert>
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  filteredRecords.map((record) => {
                    const status = record.plan?.status ?? 'none'
                    const accountStatus = record.userStatus
                    const goal = record.latestAssessment?.inputs.goal
                    const statusLabel = STATUS_LABELS[status] ?? 'Sin plan'
                    const statusColor = STATUS_COLORS[status] ?? 'default'
                    const accountLabel = USER_STATUS_LABELS[accountStatus] ?? accountStatus
                    const accountColor = USER_STATUS_COLORS[accountStatus] ?? 'success'
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
                    const unreadCount = unreadMessageCounts[record.userId] ?? 0

                    return (
                      <TableRow
                        key={record.userId}
                        hover
                        selected={record.userId === selectedUserId}
                        onClick={() => navigate(`/admin/client/${record.userId}`)}
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
                        <TableCell>
                          <Chip size="small" label={accountLabel} color={accountColor} />
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
                            {MESSAGES_ENABLED && (
                              <Badge
                                color="error"
                                badgeContent={unreadCount > 99 ? '99+' : unreadCount}
                                invisible={unreadCount < 1}
                                overlap="rectangular"
                              >
                                <Button
                                  size="small"
                                  variant="outlined"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleOpenMessageDialog({ userId: record.userId, name })
                                }}
                              >
                                  Mensajes
                                </Button>
                              </Badge>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          )}

          {isClientDetailMode && (
            <Card
              elevation={0}
              sx={{
                flex: 1,
                width: '100%',
                minWidth: 0,
              }}
            >
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                {loading ? (
                  <Stack spacing={2}>
                    <Skeleton variant="text" width="50%" />
                    <Skeleton variant="rectangular" height={140} />
                    <Skeleton variant="rectangular" height={180} />
                  </Stack>
                ) : !selectedRecord ? (
                  <Alert severity="info">No se encontro el socio seleccionado.</Alert>
                ) : (
                  <Stack spacing={2.5}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: { xs: 2, sm: 2.5 },
                        borderRadius: 3,
                      }}
                    >
                      <Stack spacing={2}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1.5}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
                        >
                          <Box>
                            <Typography variant="overline" color="text.secondary">
                              Paciente
                            </Typography>
                            <Typography variant="h4" fontWeight={800} lineHeight={1.05}>
                              {selectedPatientName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {selectedRecord.userId}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              size="small"
                              label={USER_STATUS_LABELS[selectedRecord.userStatus] ?? selectedRecord.userStatus}
                              color={USER_STATUS_COLORS[selectedRecord.userStatus]}
                            />
                            <IconButton
                              size="small"
                              onClick={handleOpenActionsMenu}
                              aria-label="Acciones secundarias"
                            >
                              <MoreVertRoundedIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Stack>

                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1.5}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', sm: 'center' }}
                        >
                          <Stack spacing={0.25}>
                            <Typography variant="body2" color="text.secondary">
                              Planificacion
                            </Typography>
                            <Typography variant="body1" fontWeight={700}>
                              {getPlanLabel(selectedRecord.plan)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Fecha: {selectedPlanDate}
                            </Typography>
                          </Stack>
                          <Button
                            variant="contained"
                            color="success"
                            onClick={handleEnablePlan}
                            disabled={!canEnablePlan || enablePlanLoading}
                          >
                            {enablePlanLoading
                              ? 'Habilitando...'
                              : canEnablePlan
                                ? 'Habilitar plan'
                                : 'Plan habilitado'}
                          </Button>
                        </Stack>

                        {enablePlanError && <Alert severity="warning">{enablePlanError}</Alert>}
                        {userStatusError && <Alert severity="warning">{userStatusError}</Alert>}
                      </Stack>
                    </Paper>

                    <Menu
                      anchorEl={actionsMenuAnchor}
                      open={actionsMenuOpen}
                      onClose={handleCloseActionsMenu}
                      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                    >
                      <MenuItem
                        onClick={() => {
                          handleCloseActionsMenu()
                          handleOpenMacroDialog()
                        }}
                        disabled={!selectedRecord.plan}
                      >
                        Editar macros
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          handleCloseActionsMenu()
                          handleOpenResetDialog()
                        }}
                      >
                        Recuperar contrasena
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          handleCloseActionsMenu()
                          handleToggleUserStatus()
                        }}
                        disabled={userStatusLoading}
                      >
                        {selectedRecord.userStatus === 'disabled' ? 'Reactivar cuenta' : 'Bloquear cuenta'}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          handleCloseActionsMenu()
                          if (selectedRecord.plan) navigate(`/plans/${selectedRecord.plan.id}`)
                        }}
                        disabled={!selectedRecord.plan}
                      >
                        Abrir plan
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          handleCloseActionsMenu()
                          handleOpenClosePlan()
                        }}
                        disabled={!canClosePlan}
                      >
                        Cerrar plan
                      </MenuItem>
                    </Menu>

                    {assessment ? (
                      <Stack spacing={2}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 3,
                            bgcolor: '#F7FBF9',
                          }}
                        >
                          <Stack spacing={2}>
                            <Typography variant="subtitle1" fontWeight={800}>
                              Perfil del paciente
                            </Typography>
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                                gap: 2,
                              }}
                            >
                              <Stack spacing={1.25}>
                                <Typography variant="caption" color="text.secondary">
                                  Datos fisicos
                                </Typography>
                                {profilePhysicalRows.map((item) => (
                                  <Stack key={item.label} direction="row" spacing={1} alignItems="center">
                                    {item.icon}
                                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 96 }}>
                                      {item.label}
                                    </Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                      {item.value}
                                    </Typography>
                                  </Stack>
                                ))}
                              </Stack>
                              <Stack spacing={1.25}>
                                <Typography variant="caption" color="text.secondary">
                                  Contexto
                                </Typography>
                                {profileContextRows.map((item) => (
                                  <Stack key={item.label} direction="row" spacing={1} alignItems="center">
                                    {item.icon}
                                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 96 }}>
                                      {item.label}
                                    </Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                      {item.value}
                                    </Typography>
                                  </Stack>
                                ))}
                              </Stack>
                            </Box>
                          </Stack>
                        </Paper>

                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.75 },
                            borderRadius: 3,
                            bgcolor: '#F4F8FF',
                            borderColor: theme.palette.primary.light,
                          }}
                        >
                          <Stack spacing={2}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <LocalFireDepartmentRoundedIcon color="primary" />
                              <Typography variant="subtitle1" fontWeight={800}>
                                Calculo energetico
                              </Typography>
                            </Stack>
                            <Stack spacing={0.25}>
                              <Typography variant="caption" color="text.secondary">
                                Kcal objetivo
                              </Typography>
                              <Typography variant="h3" fontWeight={900} color="primary.main" lineHeight={1}>
                                {effectiveOutputs ? `${formatNumber(effectiveOutputs.kcalObjectiveDay)} kcal` : '--'}
                              </Typography>
                            </Stack>
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                  xs: 'repeat(2, minmax(0, 1fr))',
                                  sm: 'repeat(4, minmax(0, 1fr))',
                                },
                                gap: 1.25,
                              }}
                            >
                              {[
                                { label: 'RMR', value: formatWithUnit(effectiveOutputs?.rmr ?? null, 'kcal') },
                                { label: 'PAL', value: formatValue(effectiveOutputs?.pal ?? null) },
                                { label: 'TDEE', value: formatWithUnit(effectiveOutputs?.tdee ?? null, 'kcal') },
                                { label: 'EEE', value: formatWithUnit(effectiveOutputs?.eee ?? null, 'kcal') },
                              ].map((metric) => (
                                <Box
                                  key={metric.label}
                                  sx={{
                                    borderRadius: 2,
                                    p: 1.25,
                                    bgcolor: 'common.white',
                                  }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    {metric.label}
                                  </Typography>
                                  <Typography variant="body1" fontWeight={800}>
                                    {metric.value}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          </Stack>
                        </Paper>

                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 3,
                            bgcolor: '#FAF7FF',
                          }}
                        >
                          <Stack spacing={2}>
                            <Typography variant="subtitle1" fontWeight={800}>
                              Distribucion de macronutrientes
                            </Typography>
                            {macroDistribution.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                Sin datos de macros para mostrar.
                              </Typography>
                            ) : (
                              <Stack spacing={1.5}>
                                {macroDistribution.map((macro) => (
                                  <Stack key={macro.id} spacing={0.6}>
                                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                                      <Typography variant="body2" fontWeight={700}>
                                        {macro.label}
                                      </Typography>
                                      <Typography variant="body2" fontWeight={700} color="text.secondary">
                                        {formatNumber(macro.grams)} g | {macro.percent}%
                                      </Typography>
                                    </Stack>
                                    <Box
                                      sx={{
                                        height: 10,
                                        borderRadius: 999,
                                        bgcolor: theme.palette.grey[200],
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          width: `${Math.min(Math.max(macro.percent, 0), 100)}%`,
                                          height: '100%',
                                          bgcolor: macro.color,
                                        }}
                                      />
                                    </Box>
                                  </Stack>
                                ))}
                              </Stack>
                            )}
                          </Stack>
                        </Paper>

                        <Accordion
                          disableGutters
                          elevation={0}
                          sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                            <Typography variant="subtitle2" fontWeight={700}>
                              Detalle tecnico (inputs y outputs)
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Stack spacing={2}>
                              <Box>
                                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                                  Inputs
                                </Typography>
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                      xs: 'repeat(1, minmax(0, 1fr))',
                                      sm: 'repeat(2, minmax(0, 1fr))',
                                    },
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

                              <Divider />

                              <Box>
                                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                                  Outputs
                                </Typography>
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                      xs: 'repeat(1, minmax(0, 1fr))',
                                      sm: 'repeat(2, minmax(0, 1fr))',
                                    },
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
                          </AccordionDetails>
                        </Accordion>

                        <Accordion
                          disableGutters
                          elevation={0}
                          sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                            <Typography variant="subtitle2" fontWeight={700}>
                              Seguimiento semanal
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
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
                              <Stack spacing={1.5}>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  alignItems="center"
                                  flexWrap="wrap"
                                  spacing={1}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    Dias {trackingWindowStart + 1}-{trackingWindowEnd} de {fullPlanIntakeData.length}
                                  </Typography>
                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      disabled={safeTrackingPage <= 0}
                                      onClick={() => setTrackingWindowPage((prev) => Math.max(0, prev - 1))}
                                    >
                                      Anterior
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      disabled={safeTrackingPage >= totalTrackingPages - 1}
                                      onClick={() =>
                                        setTrackingWindowPage((prev) =>
                                          Math.min(totalTrackingPages - 1, prev + 1),
                                        )
                                      }
                                    >
                                      Siguiente
                                    </Button>
                                  </Stack>
                                </Stack>

                                <WeeklyIntakeCard
                                  weeklyData={trackingWindowData}
                                  adherenceTolerancePct={5}
                                  title="Seguimiento semanal"
                                  subtitle="Detalle de kcal y macros por dia"
                                  detailStatusRule="macros"
                                  onEditSelectedDayMacros={handleOpenDayMacroDialog}
                                  isDayMacroSaving={dayMacroSaving}
                                  hasDayMacroOverride={hasSelectedDayMacroOverride}
                                  allowSelectionWhenEmpty
                                />
                              </Stack>
                            )}
                          </AccordionDetails>
                        </Accordion>
                      </Stack>
                    ) : (
                      <Alert severity="info">Sin evaluacion disponible.</Alert>
                    )}
                  </Stack>
                )}
            </CardContent>
          </Card>
          )}
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

      <Dialog open={messageDialogOpen} onClose={handleCloseMessageDialog} fullWidth maxWidth="sm">
        <DialogTitle>Mensajes con {messageTarget?.name ?? 'cliente'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {messageError && <Alert severity="warning">{messageError}</Alert>}

            {messageLoading ? (
              <Typography variant="body2" color="text.secondary">
                Cargando mensajes...
              </Typography>
            ) : messageItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aun no hay mensajes para este cliente.
              </Typography>
            ) : (
              <Stack spacing={1} sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.5 }}>
                {messageItems.map((item) => (
                  <Paper key={item.id} variant="outlined" sx={{ p: 1.25 }}>
                    <Stack spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}
                        </Typography>
                        <Chip
                          size="small"
                          label={item.readAt ? 'Leido' : 'No leido'}
                          color={item.readAt ? 'default' : 'warning'}
                          variant={item.readAt ? 'outlined' : 'filled'}
                        />
                      </Stack>
                      <Typography variant="body2">{item.body}</Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}

            {messageNextBefore && (
              <Box display="flex" justifyContent="center">
                <Button variant="outlined" size="small" onClick={handleLoadMoreMessages} disabled={messageLoadingMore}>
                  {messageLoadingMore ? 'Cargando...' : 'Cargar mas'}
                </Button>
              </Box>
            )}

            <TextField
              label="Nuevo mensaje"
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              fullWidth
              multiline
              minRows={3}
              inputProps={{ maxLength: 1000 }}
              disabled={messageSending}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMessageDialog} disabled={messageSending}>
            Cerrar
          </Button>
          <Button variant="contained" onClick={handleSendMessage} disabled={messageSending || !messageTarget}>
            {messageSending ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>

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

      <Dialog open={resetDialogOpen} onClose={handleCloseResetDialog} fullWidth maxWidth="sm">
        <DialogTitle>Recuperar contrasena</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2">
              Genera un enlace de recuperacion y compartelo con el usuario por el canal que prefieras.
            </Typography>
            {resetError && <Alert severity="warning">{resetError}</Alert>}
            {resetLoading && <Typography variant="caption">Generando enlace...</Typography>}
            {resetPayload && (
              <>
                <TextField
                  label="Email"
                  value={resetPayload.email}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                <TextField
                  label="Enlace de recuperacion"
                  value={resetPayload.resetUrl}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  multiline
                  minRows={2}
                />
                <TextField
                  label="Token"
                  value={resetPayload.token}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                <Typography variant="caption" color="text.secondary">
                  Expira: {dayjs(resetPayload.expiresAt).format('DD/MM/YYYY HH:mm')}
                </Typography>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseResetDialog} disabled={resetLoading}>
            Cerrar
          </Button>
          {resetPayload && (
            <Button
              variant="outlined"
              onClick={() => handleCopyReset(resetPayload.resetUrl)}
            >
              Copiar enlace
            </Button>
          )}
          {resetPayload && (
            <Button
              variant="contained"
              onClick={() => handleCopyReset(resetPayload.token)}
            >
              Copiar token
            </Button>
          )}
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

      <Dialog open={dayMacroDialogOpen} onClose={handleCloseDayMacroDialog} fullWidth maxWidth="xs">
        <DialogTitle>Ajustar macros del dia</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Aplica solo para {dayMacroDate ? dayjs(dayMacroDate).format('DD/MM/YYYY') : 'el dia seleccionado'}.
            </Typography>
            <TextField
              size="small"
              type="number"
              label="Kcal objetivo (dia)"
              value={dayMacroPreviewKcal ?? ''}
              InputProps={{ readOnly: true }}
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Proteina (g)"
              value={dayMacroForm.protein}
              onChange={(event) =>
                setDayMacroForm((prev) => ({ ...prev, protein: event.target.value }))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Carbohidratos ajustados (g)"
              value={dayMacroForm.carbsAdjusted}
              onChange={(event) =>
                setDayMacroForm((prev) => ({ ...prev, carbsAdjusted: event.target.value }))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Grasas ajustadas (g)"
              value={dayMacroForm.fatsAdjusted}
              onChange={(event) =>
                setDayMacroForm((prev) => ({ ...prev, fatsAdjusted: event.target.value }))
              }
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
            {dayMacroError && <Alert severity="warning">{dayMacroError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDayMacroDialog}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveDayMacroOverride} disabled={dayMacroSaving || !dayMacroDate}>
            {dayMacroSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

export default AdminDashboardPage
