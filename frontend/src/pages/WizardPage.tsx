import { zodResolver } from '@hookform/resolvers/zod'
import {
  Box,
  Button,
  Container,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import StepActivity from '../components/StepActivity'
import StepMeasurements from '../components/StepMeasurements'
import StepPersonal from '../components/StepPersonal'
import { createAssessment } from '../lib/api'
import { DEFAULT_VALUES, wizardSchema, type WizardFormData } from '../lib/schema'
import { loadFormData, saveFormData } from '../lib/storage'

const steps = ['Datos personales', 'Medidas', 'Actividad y objetivo']

const stepFields: (keyof WizardFormData)[][] = [
  ['name', 'sex', 'age'],
  ['weight', 'height', 'bodyFat', 'profile'],
  ['activityLevel', 'goal', 'dayType'],
]

const WizardPage = () => {
  const navigate = useNavigate()
  const stored = useMemo(() => {
    const cached = loadFormData()
    if (!cached) return null
    const parsed = wizardSchema.safeParse({ ...DEFAULT_VALUES, ...cached })
    return parsed.success ? parsed.data : null
  }, [])

  const [snackbar, setSnackbar] = useState<string | null>(null)
  const methods = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: { ...DEFAULT_VALUES, ...(stored ?? {}), dayType: 'rest' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  const [activeStep, setActiveStep] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = methods.watch((value) => saveFormData(value as Partial<WizardFormData>))
    return () => subscription.unsubscribe()
  }, [methods])

  const handleNext = async () => {
    const fields = stepFields[activeStep]

    if (fields.length) {
      const isValid = await methods.trigger(fields, { shouldFocus: true })
      if (!isValid) return
    }

    const isLast = activeStep === steps.length - 1
    if (isLast) {
      await handleFinalize()
      return
    }

    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFinalize = async () => {
    const inputs = methods.getValues()
    setSaving(true)
    try {
      const { assessment, plan } = await createAssessment(inputs)
      assessment // keep for potential future use
      setSnackbar('Plan de 30 dias guardado')
      if (plan) navigate(`/plans/${plan.id}`)
      else navigate('/plans')
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const renderStepContent = (stepIndex: number) => {
    switch (stepIndex) {
      case 0:
        return <StepPersonal />
      case 1:
        return <StepMeasurements />
      default:
        return <StepActivity />
    }
  }

  const isLastStep = activeStep === steps.length - 1

  return (
    <>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Box textAlign="center">
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Tati Nutricion Extrema Ninja
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Completa el wizard para obtener tus calorias, macros y ajustes por tipo de dia.
            </Typography>
          </Box>

          <Stepper activeStep={activeStep} alternativeLabel sx={{ px: { xs: 1, md: 6 } }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <FormProvider {...methods}>
            <form onSubmit={(event) => event.preventDefault()}>
              {renderStepContent(activeStep)}
            </form>
          </FormProvider>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            spacing={2}
          >
            <Button variant="outlined" onClick={handleBack} disabled={activeStep === 0} fullWidth>
              Atras
            </Button>

            {!isLastStep && (
              <Button variant="contained" onClick={handleNext} fullWidth disabled={saving}>
                {activeStep === steps.length - 2 ? 'Generar plan' : 'Siguiente'}
              </Button>
            )}
            {isLastStep && (
              <Button variant="contained" onClick={handleNext} fullWidth disabled={saving}>
                {saving ? 'Guardando...' : 'Generar plan'}
              </Button>
            )}
          </Stack>
        </Stack>
      </Container>
      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </>
  )
}

export default WizardPage
