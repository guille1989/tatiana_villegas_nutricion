import { Alert, Box, Button, Container, List, Snackbar, Stack, Typography } from '@mui/material'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DayEditDialog from '../components/DayEditDialog'
import DayRow from '../components/DayRow'
import { getPlan } from '../lib/api'
import type { Assessment, DayOverride, Plan } from '../types'

const PlanDetailPage = () => {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
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

  const baseOutputs = assessment?.outputs
  const baseInputs = assessment?.inputs

  const handleSaved = (record: DayOverride) => {
    setOverrides((prev) => {
      const filtered = prev.filter((item) => item.date !== record.date)
      return [...filtered, record]
    })
    setSelectedDate(null)
    setSnackbar('Dia actualizado')
  }

  const handleDeleted = (date: string) => {
    setOverrides((prev) => prev.filter((item) => item.date !== date))
    setSelectedDate(null)
    setSnackbar('Override eliminado')
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
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="h5" fontWeight={800}>
              {plan.title ?? `Plan ${plan.days} días`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inicio: {dayjs(plan.startDate).format('DD MMM YYYY')} · duracion: {plan.days} dias
            </Typography>
            {assessment && assessment.id !== plan.baseAssessmentId && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Este plan se creo con otra evaluacion. Se usa la asociada al plan.
              </Alert>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => navigate('/plans')}>
              Volver
            </Button>
            <Button variant="contained" onClick={() => navigate('/wizard')}>
              Abrir wizard
            </Button>
          </Stack>
        </Stack>

        {!baseOutputs && (
          <Alert severity="warning">
            No hay outputs base cargados. Guarda una evaluacion y vuelve a abrir el plan.
          </Alert>
        )}

        <List disablePadding>
          {dates.map((date) => {
            const override = overrides.find((item) => item.date === date)
            const outputs = override?.computed ?? baseOutputs
            const dayType = override?.overrides.dayType ?? baseInputs?.dayType ?? 'rest'
            const isExpanded = expandedDate === date

            return outputs ? (
              <DayRow
                key={date}
                date={date}
                outputs={outputs}
                dayType={dayType as 'training' | 'rest'}
                hasOverride={!!override}
                note={override?.note}
                isExpanded={isExpanded}
                onToggle={() => setExpandedDate(isExpanded ? null : date)}
                onEdit={() => setSelectedDate(date)}
              />
            ) : null
          })}
        </List>
      </Stack>

      {selectedDate && baseInputs && (
        <DayEditDialog
          open
          planId={planId}
          date={selectedDate}
          baseInputs={baseInputs}
          existingOverride={overrides.find((item) => item.date === selectedDate)}
          onClose={() => setSelectedDate(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        message={snackbar}
        onClose={() => setSnackbar(null)}
      />
    </Container>
  )
}

export default PlanDetailPage
