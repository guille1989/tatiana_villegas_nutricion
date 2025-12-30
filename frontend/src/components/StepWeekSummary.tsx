import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { calculateInitials } from '../lib/calc'
import { DEFAULT_VALUES, type WizardFormData } from '../lib/schema'
import type { WizardInputs } from '../types'
import { useTheme } from '@mui/material/styles'

type Props = {
  onReset: () => void
  onFinalize: (weekState: WeekDayState[]) => void
  isSaving?: boolean
  hasSavedAssessment: boolean
  lastSavedAt?: string | null
}

type WeekDayState = {
  key: string
  label: string
  status: 'rest' | 'training'
  sessions: 1 | 2
}

const daysOfWeek = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
const dayAbbr = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
const formatInt = (value: number) => Math.round(value)

const StepWeekSummary = ({
  onReset,
  onFinalize,
  isSaving,
  hasSavedAssessment,
  lastSavedAt,
}: Props) => {
  const { control } = useFormContext<WizardFormData>()
  const values = useWatch({ control, defaultValue: DEFAULT_VALUES }) as WizardFormData
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))

  const [week, setWeek] = useState<WeekDayState[]>(
    daysOfWeek.map((label, idx) => ({
      key: `${idx}`,
      label,
      status: 'rest',
      sessions: 1,
    })),
  )
  const [selectedIndex, setSelectedIndex] = useState(0)

  const baseInputs: WizardInputs = useMemo(
    () => ({
      ...values,
      dayType: 'rest',
      trainingType: undefined,
      duration: undefined,
      trainingMet: undefined,
    }),
    [values],
  )

  const result = useMemo(() => calculateInitials(baseInputs), [baseInputs])
  const trainingCount = week.filter((d) => d.status === 'training').length
  const selectedDay = week[selectedIndex]

  const cycleDay = (index: number) => {
    setSelectedIndex(index)
    setWeek((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        if (item.status === 'rest') return { ...item, status: 'training', sessions: 1 }
        if (item.status === 'training' && item.sessions === 1) return { ...item, status: 'training', sessions: 2 }
        return { ...item, status: 'rest', sessions: 1 }
      }),
    )
  }

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title={
          <Stack spacing={0.5} alignItems="flex-start">
            <Typography variant="h6" fontWeight={800}>
              Plan de 7 dias
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Vista rapida de tu semana con dias de descanso por defecto.
            </Typography>
            <Chip
              size="small"
              color={trainingCount > 0 ? 'primary' : 'default'}
              label={trainingCount > 0 ? `${trainingCount} dia(s) de entreno` : 'Semana en descanso'}
              sx={{ mt: 0.5 }}
            />
          </Stack>
        }
      />
      <CardContent>
        <Alert
          severity="info"
          icon={false}
          sx={{
            mb: 2,
            borderRadius: 2,
            py: 1,
            px: 1.5,
            typography: 'body2',
          }}
        >
          Todos los dias se marcan como <strong>no entreno</strong> por defecto. Ajusta luego en el plan si lo
          necesitas.
        </Alert>

        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            overflowX: 'auto',
            pb: 1,
            '&::-webkit-scrollbar': { display: 'none' },
            px: 0.5,
          }}
        >
          {week.map((day, idx) => {
            const isTraining = day.status === 'training'
            const isSelected = selectedIndex === idx
            return (
              <Stack
                key={day.key}
                spacing={0.5}
                alignItems="center"
                minWidth={64}
                onClick={() => cycleDay(idx)}
                sx={{ cursor: 'pointer' }}
                aria-label={`${day.label} ${isTraining ? 'entreno' : 'descanso'}`}
              >
                <Typography variant="caption" color="text.secondary">
                  {dayAbbr[idx]}
                </Typography>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: isTraining ? 'transparent' : 'grey.300',
                    color: isTraining ? 'primary.main' : 'grey.100',
                    border: isTraining ? '2px solid' : 'none',
                    borderColor: isTraining ? 'primary.main' : 'transparent',
                    fontWeight: 700,
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected
                      ? `0 0 0 3px ${theme.palette.primary.main}22`
                      : '0 0 0 1px transparent',
                  }}
                >
                  {isTraining ? day.sessions : ''}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {isTraining ? 'Entreno' : 'Descanso'}
                </Typography>
              </Stack>
            )
          })}
        </Stack>

        {isDesktop ? (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { md: 'repeat(3, minmax(0,1fr))', sm: 'repeat(2, minmax(0,1fr))' },
            }}
          >
            {week.map((day) => {
              const isTraining = day.status === 'training'
              return (
                <Card
                  key={day.key}
                  variant="outlined"
                  sx={{
                    height: '100%',
                    borderColor: isTraining ? 'primary.light' : 'divider',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle1" fontWeight={700}>
                        {day.label}
                      </Typography>
                      <Chip
                        label={isTraining ? `Entreno ${day.sessions}x` : 'Descanso'}
                        size="small"
                        color={isTraining ? 'primary' : 'default'}
                        variant={isTraining ? 'outlined' : 'filled'}
                      />
                    </Stack>
                    <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="h4" fontWeight={800}>
                        {formatInt(result.kcalObjectiveDay)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        kcal
                      </Typography>
                    </Stack>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={`Proteina ${formatInt(result.protein)} g`} size="small" variant="outlined" />
                      <Chip label={`Carbs ${formatInt(result.carbsAdjusted)} g`} size="small" variant="outlined" />
                      <Chip label={`Grasas ${formatInt(result.fatsAdjusted)} g`} size="small" variant="outlined" />
                    </Stack>
                  </CardContent>
                </Card>
              )
            })}
          </Box>
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Card
              variant="outlined"
              sx={{
                borderColor: selectedDay.status === 'training' ? 'primary.light' : 'divider',
              }}
            >
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1" fontWeight={700}>
                    {selectedDay.label}
                  </Typography>
                  <Chip
                    label={
                      selectedDay.status === 'training'
                        ? `Entreno ${selectedDay.sessions}x`
                        : 'Descanso'
                    }
                    size="small"
                    color={selectedDay.status === 'training' ? 'primary' : 'default'}
                    variant={selectedDay.status === 'training' ? 'outlined' : 'filled'}
                  />
                </Stack>
                <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="h4" fontWeight={800}>
                    {formatInt(result.kcalObjectiveDay)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    kcal
                  </Typography>
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={`Proteina ${formatInt(result.protein)} g`} size="small" variant="outlined" />
                  <Chip label={`Carbs ${formatInt(result.carbsAdjusted)} g`} size="small" variant="outlined" />
                  <Chip label={`Grasas ${formatInt(result.fatsAdjusted)} g`} size="small" variant="outlined" />
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ mt: 3 }}
        >
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Esta vista usa tus datos base y marca toda la semana como descanso.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {lastSavedAt ? `Guardado: ${lastSavedAt}` : 'Aun no guardas esta evaluacion.'}
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
        </Stack>

        {!hasSavedAssessment && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Al guardar se crea o actualiza tu plan base de 7 dias y podras editar overrides por dia.
            </Typography>
          </>
        )}
      </CardContent>

      <Paper
        elevation={8}
        sx={{
          position: { xs: 'sticky', md: 'static' },
          bottom: 0,
          left: 0,
          right: 0,
          px: 2,
          py: 1.5,
          borderTop: { xs: `1px solid ${theme.palette.divider}`, md: 'none' },
          background: { xs: theme.palette.background.paper, md: 'transparent' },
          zIndex: 2,
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="flex-end"
          alignItems="stretch"
        >
          <Button variant="outlined" color="secondary" onClick={onReset}>
            Reiniciar
          </Button>
          <Button variant="contained" onClick={() => onFinalize(week)} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar y ver plan de 7 dias'}
          </Button>
        </Stack>
      </Paper>
    </Card>
  )
}

export default StepWeekSummary
