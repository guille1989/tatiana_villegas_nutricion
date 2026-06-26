import { Box, Button, Chip, Card, CardContent, CardHeader, Divider, Stack, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { calculateInitials, getMacroKcalBreakdown } from '../lib/calc'
import { DEFAULT_VALUES, visibleDayTypeOptions, type WizardFormData } from '../lib/schema'

type Props = {
  onReset: () => void
  onSaveAssessment: () => void
  onGoPlans: () => void
  hasSavedAssessment: boolean
  lastSavedAt?: string | null
}

type ResultCardProps = {
  title: string
  value: string
  subtitle?: string
  accent?: string
}

const formatInt = (value: number) => Math.round(value)
const formatFactor = (value: number) => value.toFixed(2)

const ResultCard = ({ title, value, subtitle, accent }: ResultCardProps) => (
  <Card elevation={0} sx={{ borderColor: accent ? `${accent}33` : 'divider', borderWidth: 1, borderStyle: 'solid' }}>
    <CardContent>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
)

const StepResults = ({ onReset, onSaveAssessment, onGoPlans, hasSavedAssessment, lastSavedAt }: Props) => {
  const { control } = useFormContext<WizardFormData>()
  const values = useWatch({ control, defaultValue: DEFAULT_VALUES }) as WizardFormData

  const result = useMemo(() => calculateInitials(values), [values])
  const dayTypeLabel = visibleDayTypeOptions.find((option) => option.value === values.dayType)?.label ?? 'Descanso'
  const macroKcal = useMemo(
    () =>
      getMacroKcalBreakdown({
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fats,
      }),
    [result.carbs, result.fats, result.protein],
  )

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Resultados"
        subheader="Calculos segun tus datos y objetivo. Ajustes diarios auto-calculados."
        action={
          <Chip
            label={dayTypeLabel}
            color={values.dayType === 'rest' ? 'default' : 'primary'}
            variant="outlined"
          />
        }
      />
      <CardContent>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'repeat(1, minmax(0,1fr))', sm: 'repeat(2, minmax(0,1fr))', md: 'repeat(3, minmax(0,1fr))' },
          }}
        >
          <ResultCard title="RMR" value={`${formatInt(result.rmr)} kcal`} subtitle="Metabolismo en reposo" />
          <ResultCard title="PAL" value={formatFactor(result.pal)} subtitle="Factor actividad" />
          <ResultCard title="TDEE" value={`${formatInt(result.tdee)} kcal`} subtitle="Gasto diario estimado" />
          <ResultCard title="Kcal objetivo base" value={`${formatInt(result.kcalObjectiveBase)} kcal`} />
          <ResultCard title="Ajuste entreno" value={`${formatInt(result.eee)} kcal`} subtitle="Extra del preset" />
          <ResultCard title="Kcal objetivo del dia" value={`${formatInt(result.kcalObjectiveDay)} kcal`} subtitle="Segun tipo de dia" accent="#2563eb" />
          <ResultCard title="Proteina" value={`${formatInt(result.protein)} g`} subtitle={`~${Math.round(macroKcal.proteinKcal)} kcal`} />
          <ResultCard title="Grasas" value={`${formatInt(result.fats)} g`} subtitle={`~${Math.round(macroKcal.fatKcal)} kcal`} />
          <ResultCard title="Carbohidratos" value={`${formatInt(result.carbs)} g`} subtitle={`~${Math.round(macroKcal.carbsKcal)} kcal`} />
          <ResultCard
            title="Carbs ajustados"
            value={`${formatInt(result.carbsAdjusted)} g`}
            subtitle="Objetivo del preset"
          />
          <ResultCard
            title="Grasas ajustadas"
            value={`${formatInt(result.fatsAdjusted)} g`}
            subtitle="Residual kcal"
          />
          {result.ffm !== undefined && <ResultCard title="FFM" value={`${formatInt(result.ffm)} kg`} subtitle="Masa libre de grasa" />}
          {result.ea !== undefined && (
            <ResultCard title="EA (Energy Availability)" value={`${formatInt(result.ea)} kcal/kg FFM`} subtitle="(Kcal - EEE) / FFM" />
          )}
        </Box>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ mt: 3 }}
        >
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Recuerda que estos resultados son una referencia inicial. Ajusta segun tus sensaciones.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {lastSavedAt ? `Guardado: ${lastSavedAt}` : 'Aún no guardas esta evaluación.'}
            </Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="stretch">
            <Button variant="outlined" color="secondary" onClick={onReset}>
              Reiniciar
            </Button>
            <Button variant="outlined" onClick={onSaveAssessment}>
              Guardar evaluación
            </Button>
            <Button variant="contained" onClick={onGoPlans} disabled={!hasSavedAssessment}>
              Crear plan
            </Button>
          </Stack>
        </Stack>

        {!hasSavedAssessment && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Guarda tu evaluación para habilitar la creación de planes y overrides por día.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default StepResults
