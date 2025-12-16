import { Button, Chip, Card, CardContent, CardHeader, Divider, Stack, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { calculateInitials } from '../lib/calc'
import { DEFAULT_VALUES, type WizardFormData } from '../lib/schema'
import Grid from '@mui/material/GridLegacy'

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

  return (
    <Card elevation={0} className="step-card">
      <CardHeader
        title="Resultados"
        subheader="Calculos segun tus datos y objetivo. Ajustes diarios auto-calculados."
        action={
          <Chip
            label={values.dayType === 'training' ? 'Dia de entreno' : 'Dia de descanso'}
            color={values.dayType === 'training' ? 'primary' : 'default'}
            variant="outlined"
          />
        }
      />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <ResultCard title="RMR" value={`${result.rmr} kcal`} subtitle="Metabolismo en reposo" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <ResultCard title="PAL" value={result.pal.toFixed(2)} subtitle="Factor actividad" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <ResultCard title="TDEE" value={`${result.tdee} kcal`} subtitle="Gasto diario estimado" />
          </Grid>

          <Grid item xs={12} sm={4}>
            <ResultCard title="Kcal objetivo base" value={`${result.kcalObjectiveBase} kcal`} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <ResultCard
              title="EEE (si entrenas)"
              value={`${result.eee} kcal`}
              subtitle="Gasto de ejercicio"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <ResultCard
              title="Kcal objetivo del dia"
              value={`${result.kcalObjectiveDay} kcal`}
              subtitle="Incluye ejercicio"
              accent="#2563eb"
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <ResultCard
              title="Proteina"
              value={`${result.protein} g`}
              subtitle={`~${Math.round(result.protein * 4)} kcal`}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <ResultCard
              title="Grasas"
              value={`${result.fats} g`}
              subtitle={`~${Math.round(result.fats * 9)} kcal`}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <ResultCard
              title="Carbohidratos"
              value={`${result.carbs} g`}
              subtitle={`~${Math.round(result.carbs * 4)} kcal`}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <ResultCard
              title="Carbs ajustados"
              value={`${result.carbsAdjusted} g`}
              subtitle={values.dayType === 'training' ? 'Factor 1.2 por entreno' : 'Factor 0.85 por descanso'}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <ResultCard
              title="Grasas ajustadas"
              value={`${result.fatsAdjusted} g`}
              subtitle={values.dayType === 'training' ? 'Factor 0.85 por entreno' : 'Factor 1.2 por descanso'}
            />
          </Grid>

          {result.ffm !== undefined && (
            <Grid item xs={12} sm={6}>
              <ResultCard title="FFM" value={`${result.ffm} kg`} subtitle="Masa libre de grasa" />
            </Grid>
          )}
          {result.ea !== undefined && (
            <Grid item xs={12} sm={6}>
              <ResultCard
                title="EA (Energy Availability)"
                value={`${result.ea} kcal/kg FFM`}
                subtitle="(Kcal - EEE) / FFM"
              />
            </Grid>
          )}
        </Grid>

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
