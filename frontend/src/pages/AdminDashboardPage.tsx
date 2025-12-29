import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  FormControl,
  InputLabel,
  LinearProgress,
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
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLatestAssessment, getPlan, listPlans } from '../lib/api'
import { getMacroState, type MacroState } from '../lib/macroStatus'
import type { Assessment, CalculationOutputs, DayOverride, Meal, Plan } from '../types'

const ADMIN_USER_IDS = ['demo-user', 'socio-ana', 'socio-carlos']

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

type AdminRecord = {
  userId: string
  latestAssessment?: Assessment | null
  plan?: Plan | null
  planAssessment?: Assessment | null
  overrides: DayOverride[]
  lastUpdate?: string | null
  adherence: AdherenceSummary
  trend: TrendPoint[]
}

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

const totalsFromMeals = (meals: Meal[]) =>
  meals.reduce(
    (acc, meal) => ({
      protein: acc.protein + meal.totals.protein,
      carbs: acc.carbs + meal.totals.carbs,
      fat: acc.fat + meal.totals.fat,
      kcal: acc.kcal + meal.totals.kcal,
    }),
    { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  )

const getPlanLabel = (plan?: Plan | null) => {
  if (!plan) return 'Sin plan'
  return plan.title ?? `Plan ${plan.days} dias`
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

const toPortions = (macros: { protein: number; carbs: number; fat: number }) => ({
  protein: macros.protein / 10,
  carbs: macros.carbs / 15,
  fat: macros.fat / 5,
})

const getAdherenceFromMeals = (
  meals: Meal[] | undefined,
  outputs?: CalculationOutputs | null,
): AdherenceSummary => {
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
    getMacroState(remaining[key], budgetPortions[key]),
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

const buildTrend = (
  overrides: DayOverride[],
  outputs?: CalculationOutputs | null,
  days = 7,
): TrendPoint[] => {
  const today = dayjs()
  return Array.from({ length: days }, (_, idx) => {
    const date = today.subtract(days - 1 - idx, 'day').format('YYYY-MM-DD')
    const label = dayjs(date).format('dd').toUpperCase()
    const override = overrides.find((item) => item.date === date)
    const meals = override?.meals as Meal[] | undefined
    const summary = getAdherenceFromMeals(meals, override?.computed ?? outputs ?? null)
    return {
      date,
      label,
      progress: summary.progress,
      state: summary.state,
    }
  })
}

const AdminDashboardPage = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [records, setRecords] = useState<AdminRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [goalFilter, setGoalFilter] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const results = await Promise.allSettled(
          ADMIN_USER_IDS.map(async (userId) => {
            const [assessment, plans] = await Promise.all([
              getLatestAssessment(userId).catch(() => null),
              listPlans(userId).catch(() => []),
            ])
            const activePlan =
              plans.find((plan) => plan.status === 'active') ??
              plans.sort((a, b) => dayjs(b.createdAt).diff(a.createdAt))[0]

            if (!activePlan) {
              return {
                userId,
                latestAssessment: assessment,
                plan: null,
                planAssessment: null,
                overrides: [],
                lastUpdate: null,
                adherence: { state: 'none', progress: 0, label: 'Sin datos' },
                trend: buildTrend([], assessment?.outputs ?? null),
              }
            }

            const planData = await getPlan(activePlan.id).catch(() => null)
            const overrides = planData?.overrides ?? []
            const planAssessment = planData?.assessment ?? null
            const sourceOutputs = planAssessment?.outputs ?? assessment?.outputs ?? null

            const overridesWithMeals = overrides.filter((item) => Array.isArray(item.meals) && item.meals.length > 0)
            const latestMealsOverride = overridesWithMeals.sort((a, b) => dayjs(b.updatedAt).diff(a.updatedAt))[0]
            const adherence = getAdherenceFromMeals(latestMealsOverride?.meals as Meal[] | undefined, sourceOutputs)

            return {
              userId,
              latestAssessment: assessment,
              plan: planData?.plan ?? activePlan,
              planAssessment,
              overrides,
              lastUpdate: getLastUpdateDate(activePlan, overrides),
              adherence: latestMealsOverride ? { ...adherence, lastDate: latestMealsOverride.date } : adherence,
              trend: buildTrend(overrides, sourceOutputs),
            }
          }),
        )

        const nextRecords = results.map((result, index) => {
          if (result.status === 'fulfilled') return result.value
          return {
            userId: ADMIN_USER_IDS[index],
            latestAssessment: null,
            plan: null,
            planAssessment: null,
            overrides: [],
            lastUpdate: null,
            adherence: { state: 'none', progress: 0, label: 'Sin datos' },
            trend: buildTrend([], null),
          }
        })

        if (active) setRecords(nextRecords)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar')
      } finally {
        if (active) setLoading(false)
      }
    }

    // TODO: reemplazar ADMIN_USER_IDS por endpoint admin real.
    load()
    return () => {
      active = false
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return records.filter((record) => {
      const name = record.latestAssessment?.inputs.name ?? ''
      const goal = record.latestAssessment?.inputs.goal ?? ''
      const status = record.plan?.status ?? 'none'
      const matchesTerm =
        term.length === 0 ||
        name.toLowerCase().includes(term) ||
        record.userId.toLowerCase().includes(term)
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

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
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
                    Sin update +7 dias
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
                  <MenuItem value="draft">Borrador</MenuItem>
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

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems="flex-start">
          <Paper sx={{ flex: 2, width: '100%' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Socio</TableCell>
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
                    const lastUpdate = record.lastUpdate
                      ? dayjs(record.lastUpdate).format('DD MMM YYYY')
                      : '--'
                    const adherence = record.adherence
                    const adherenceChipColor =
                      adherence.state === 'ok'
                        ? 'success'
                        : adherence.state === 'over'
                          ? 'error'
                          : adherence.state === 'pending'
                            ? 'warning'
                            : 'default'

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
                            <Typography fontWeight={700}>
                              {record.latestAssessment?.inputs.name ?? 'Sin nombre'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {record.userId}
                            </Typography>
                          </Stack>
                        </TableCell>
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
                            <Button
                              size="small"
                              variant="text"
                              onClick={(event) => event.stopPropagation()}
                            >
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
                      {selectedRecord.latestAssessment?.inputs.name ?? 'Sin nombre'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedRecord.userId}
                    </Typography>
                    {selectedRecord.plan && (
                      <Typography variant="body2">{getPlanLabel(selectedRecord.plan)}</Typography>
                    )}
                  </Stack>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Resumen evaluacion
                    </Typography>
                    {selectedRecord.latestAssessment ? (
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Peso
                            </Typography>
                            <Typography fontWeight={700}>
                              {selectedRecord.latestAssessment.inputs.weight} kg
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              % Grasa
                            </Typography>
                            <Typography fontWeight={700}>
                              {selectedRecord.latestAssessment.inputs.bodyFat ?? '--'}
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Kcal objetivo
                            </Typography>
                            <Typography fontWeight={700}>
                              {selectedRecord.latestAssessment.outputs.kcalObjectiveDay}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Proteina
                            </Typography>
                            <Typography fontWeight={700}>
                              {selectedRecord.latestAssessment.outputs.protein} g
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Carbs
                            </Typography>
                            <Typography fontWeight={700}>
                              {selectedRecord.latestAssessment.outputs.carbsAdjusted} g
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Grasas
                            </Typography>
                            <Typography fontWeight={700}>
                              {selectedRecord.latestAssessment.outputs.fatsAdjusted} g
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>
                    ) : (
                      <Alert severity="info">Sin evaluacion disponible.</Alert>
                    )}
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Delta vs evaluacion previa
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Sin evaluaciones previas o endpoint disponible.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Tendencia ultima semana
                    </Typography>
                    <Stack spacing={1}>
                      {selectedRecord.trend.map((point) => (
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
    </Container>
  )
}

export default AdminDashboardPage
