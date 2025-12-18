import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Fade,
  Grid,
  Paper,
  Snackbar,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'
import { useNavigate, useParams } from 'react-router-dom'
import DayEditDialog from '../components/DayEditDialog'
import { calculateDayFromBase } from '../lib/calc'
import { getPlan } from '../lib/api'
import type { Assessment, DayOverride, Plan } from '../types'

const PlanDetailPage = () => {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const detailRef = useRef<HTMLDivElement | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!planId) return
    getPlan(planId)
      .then(({ plan: fetchedPlan, overrides: fetchedOverrides, assessment: baseAssessment }) => {
        setPlan(fetchedPlan)
        setOverrides(fetchedOverrides ?? [])
        setAssessment(baseAssessment ?? null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el plan'))
  }, [planId])

  const dates = useMemo(() => {
    if (!plan) return []
    const start = dayjs(plan.startDate)
    return Array.from({ length: plan.days }, (_, idx) => start.add(idx, 'day').format('YYYY-MM-DD'))
  }, [plan])

  useEffect(() => {
    if (dates.length && !selectedDate) {
      setSelectedDate(dates[0])
    }
  }, [dates, selectedDate])

  useEffect(() => {
    if (selectedDate && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedDate])

  const baseOutputs = assessment?.outputs
  const baseInputs = assessment?.inputs

  const handleSaved = (record: DayOverride) => {
    setOverrides((prev) => {
      const filtered = prev.filter((item) => item.date !== record.date)
      return [...filtered, record]
    })
    setEditingDate(null)
    setSnackbar('Dia actualizado')
  }

  const handleDeleted = (date: string) => {
    setOverrides((prev) => prev.filter((item) => item.date !== date))
    setEditingDate(null)
    setSnackbar('Override eliminado')
  }

  const computeOutputs = (override?: DayOverride) => {
    if (!baseInputs) return baseOutputs
    if (override?.computed) return override.computed
    if (override) {
      try {
        return calculateDayFromBase(baseInputs, override.overrides)
      } catch {
        return baseOutputs
      }
    }
    return baseOutputs
  }

  const selectedOverride = overrides.find((item) => item.date === selectedDate)
  const selectedOutputs = computeOutputs(selectedOverride)
  const selectedDayType = selectedOverride?.overrides.dayType ?? baseInputs?.dayType ?? 'rest'

  const getDayData = (date: string) => {
    const override = overrides.find((item) => item.date === date)
    const outputs = computeOutputs(override)
    const dayType = override?.overrides.dayType ?? baseInputs?.dayType ?? 'rest'
    return { outputs, dayType, override }
  }

  const MacroDonut = ({
    protein,
    carbs,
    fats,
    kcal,
  }: {
    protein: number
    carbs: number
    fats: number
    kcal: number
  }) => {
    const size = 92
    const stroke = 12
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius

    const proteinKcal = protein * 4
    const carbsKcal = carbs * 4
    const fatsKcal = fats * 9
    const total = proteinKcal + carbsKcal + fatsKcal

    const getDash = (val: number) => (total > 0 ? (val / total) * circumference : 0)

    const segments = [
      { val: proteinKcal, color: theme.palette.primary.main },
      { val: carbsKcal, color: theme.palette.success.main },
      { val: fatsKcal, color: theme.palette.warning.main },
    ]

    let offset = 0

    return (
      <Box sx={{ position: 'relative', width: size, height: size, minWidth: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={theme.palette.grey[200]}
            strokeWidth={stroke}
          />
          {total === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={theme.palette.grey[400]}
              strokeWidth={stroke}
            />
          ) : (
            segments.map((seg, idx) => {
              const dash = getDash(seg.val)
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
            })
          )}
        </svg>
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <Typography variant="h6" fontWeight={800} lineHeight={1}>
            {kcal}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            kcal
          </Typography>
        </Stack>
      </Box>
    )
  }

  if (!planId) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Plan no encontrado.</Alert>
      </Container>
    )
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={2}>
          <Alert severity="warning">{error}</Alert>
          <Button variant="contained" onClick={() => navigate('/plans')}>
            Volver a planes
          </Button>
        </Stack>
      </Container>
    )
  }

  if (!plan) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>Cargando...</Typography>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          spacing={1.5}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          sx={{ pt: 1 }}
        >
          <Stack spacing={0.5}>
            <Typography variant="h5" fontWeight={800}>
              Plan 7 dias
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inicio: {dayjs(plan.startDate).format('DD MMM YYYY')} · Duracion: {plan.days} dias
            </Typography>
            {assessment && assessment.id !== plan.baseAssessmentId && (
              <Typography variant="caption" color="text.secondary">
                Este plan se creo con otra evaluacion. Se usa la asociada al plan.
              </Typography>
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} width={{ xs: '100%', md: 'auto' }}>
            <Button variant="outlined" onClick={() => navigate('/plans')} fullWidth={!isDesktop}>
              Volver
            </Button>
            <Button variant="contained" onClick={() => navigate('/wizard')} fullWidth={!isDesktop}>
              Abrir wizard
            </Button>
          </Stack>
        </Stack>

        {!baseOutputs && (
          <Alert severity="warning">
            No hay outputs base cargados. Guarda una evaluacion y vuelve a abrir el plan.
          </Alert>
        )}

        {/* Week switcher */}
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            overflowX: 'auto',
            pb: 0.5,
            '&::-webkit-scrollbar': { display: 'none' },
            scrollSnapType: { xs: 'x mandatory', md: 'none' },
          }}
        >
          {dates.map((date) => {
            const day = dayjs(date)
            const { outputs, dayType } = getDayData(date)
            const isSelected = selectedDate === date
            const isTraining = dayType === 'training'
            const kcal = outputs?.kcalObjectiveDay
            return (
              <ButtonBase
                key={date}
                onClick={() => setSelectedDate(date)}
                sx={{
                  borderRadius: 3,
                  px: 1,
                  py: 0.5,
                  scrollSnapAlign: 'start',
                  border: '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'transparent',
                  bgcolor: isSelected ? 'primary.main' + '0D' : 'transparent',
                  transition: 'all 0.2s ease',
                  minWidth: 82,
                  '&:hover': { borderColor: 'primary.light', bgcolor: 'primary.main' + '0A' },
                }}
                aria-label={`Seleccionar ${day.format('dddd')} ${isTraining ? 'entreno' : 'descanso'} ${
                  kcal ?? ''
                } kcal`}
              >
                <Stack spacing={0.5} alignItems="center" width="100%">
                  <Typography variant="caption" color="text.secondary">
                    {day.format('ddd').toUpperCase()}
                  </Typography>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: isTraining ? 'transparent' : 'grey.300',
                      color: isTraining ? 'primary.main' : 'grey.50',
                      border: isTraining ? '2px solid' : '1px solid transparent',
                      borderColor: isTraining ? 'primary.main' : 'transparent',
                      fontWeight: 700,
                      boxShadow: isSelected
                        ? `0 0 0 3px ${theme.palette.primary.main}33`
                        : '0 0 0 1px transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isTraining ? '✓' : ''}
                  </Box>
                  <Chip
                    size="small"
                    label={isTraining ? 'Entreno' : 'Descanso'}
                    color={isTraining ? 'primary' : 'default'}
                    variant={isTraining ? 'outlined' : 'filled'}
                  />
                  {kcal !== undefined && (
                    <Typography variant="caption" color="text.secondary">
                      {kcal} kcal
                    </Typography>
                  )}
                </Stack>
              </ButtonBase>
            )
          })}
        </Stack>

        {/* Summary card */}
        {selectedOutputs && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 3,
              borderColor: 'divider',
              scrollMarginTop: 16,
            }}
            ref={detailRef}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>
                  {dayjs(selectedDate).format('dddd, DD MMM YYYY')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  EEE: {selectedOutputs.eee} kcal
                </Typography>
              </Box>
              <Chip
                label={selectedDayType === 'training' ? 'Entreno' : 'Descanso'}
                color={selectedDayType === 'training' ? 'primary' : 'default'}
                variant={selectedDayType === 'training' ? 'outlined' : 'filled'}
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
              />
            </Stack>
          </Paper>
        )}

        {/* Detail card */}
        <Fade in={!!selectedOutputs}>
          <div>
            {selectedOutputs && (
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: 'divider',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
                  p: { xs: 2, md: 2.5 },
                }}
              >
                <Stack spacing={2}>
                  <Stack spacing={0.25}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      Resumen nutricional
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Objetivo del dia
                    </Typography>
                  </Stack>

                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    alignItems={{ xs: 'center', md: 'center' }}
                    spacing={{ xs: 2, md: 3 }}
                  >
                    <MacroDonut
                      protein={selectedOutputs.protein}
                      carbs={selectedOutputs.carbsAdjusted}
                      fats={selectedOutputs.fatsAdjusted}
                      kcal={selectedOutputs.kcalObjectiveDay}
                    />

                    <Grid
                      container
                      spacing={1}
                      sx={{
                        width: '100%',
                        maxWidth: 420,
                        gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(3, 1fr)' },
                      }}
                    >
                      <Grid item xs={12} sm={4}>
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            borderRadius: 999,
                            bgcolor: 'grey.100',
                            border: `1px solid ${theme.palette.divider}`,
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            P
                          </Typography>
                          <Typography variant="body1" fontWeight={700}>
                            {selectedOutputs.protein} g
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            borderRadius: 999,
                            bgcolor: 'grey.100',
                            border: `1px solid ${theme.palette.divider}`,
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            C
                          </Typography>
                          <Typography variant="body1" fontWeight={700}>
                            {selectedOutputs.carbsAdjusted} g
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            borderRadius: 999,
                            bgcolor: 'grey.100',
                            border: `1px solid ${theme.palette.divider}`,
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            G
                          </Typography>
                          <Typography variant="body1" fontWeight={700}>
                            {selectedOutputs.fatsAdjusted} g
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Stack>

                  <Box display="flex" justifyContent="flex-end">
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => selectedDate && setEditingDate(selectedDate)}
                      aria-label="Editar dia"
                    >
                      Editar dia
                    </Button>
                  </Box>
                </Stack>
              </Card>
            )}
          </div>
        </Fade>
      </Stack>

      {editingDate && baseInputs && (
        <DayEditDialog
          open
          planId={planId}
          date={editingDate}
          baseInputs={baseInputs}
          existingOverride={overrides.find((item) => item.date === editingDate)}
          onClose={() => setEditingDate(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      <Snackbar open={!!snackbar} autoHideDuration={2500} message={snackbar} onClose={() => setSnackbar(null)} />
    </Container>
  )
}

export default PlanDetailPage
