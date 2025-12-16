import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPlan, deletePlan, getLatestAssessment, listPlans } from '../lib/api'
import type { Assessment, Plan } from '../types'

type PlanDays = 5 | 15 | 30

const PlansPage = () => {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<Plan[]>([])
  const [days, setDays] = useState<PlanDays>(5)
  const [startDate, setStartDate] = useState<Dayjs>(dayjs())
  const [title, setTitle] = useState('')
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)

  useEffect(() => {
    getLatestAssessment()
      .then((res) => setAssessment(res))
      .catch(() => setAssessment(null))
    listPlans()
      .then((res) => setPlans(res))
      .catch(() => setPlans([]))
  }, [])

  const handleCreate = async () => {
    if (!assessment) {
      setSnackbar('Guarda una evaluacion en el wizard antes de crear un plan.')
      return
    }

    try {
      const newPlan = await createPlan({
        baseAssessmentId: assessment.id,
        startDate: startDate.toISOString(),
        days,
        title: title.trim() || undefined,
      })
      setPlans((prev) => [...prev, newPlan])
      setSnackbar('Plan creado')
      navigate(`/plans/${newPlan.id}`)
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'No se pudo crear el plan')
    }
  }

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

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Planes
          </Typography>
          <Typography color="text.secondary">
            Define tus planes de 5/15/30 dias y ajusta cada dia con overrides.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <Card elevation={0}>
              <CardHeader title="Crear plan" subheader="Necesita una evaluacion guardada" />
              <CardContent>
                {!assessment && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Guarda tu evaluacion en el wizard para habilitar la creacion.
                  </Alert>
                )}
                <Stack spacing={2}>
                  <TextField
                    label="Titulo (opcional)"
                    placeholder="Plan cutting, Plan fuerza..."
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    select
                    label="Duracion"
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value) as PlanDays)}
                    fullWidth
                  >
                    {[5, 15, 30].map((option) => (
                      <MenuItem key={option} value={option}>
                        {option} dias
                      </MenuItem>
                    ))}
                  </TextField>
                  <DatePicker
                    label="Fecha de inicio"
                    value={startDate}
                    onChange={(value) => setStartDate(value ?? dayjs())}
                    slotProps={{ textField: { fullWidth: true } }}
                  />

                  <Button variant="contained" onClick={handleCreate} disabled={!assessment}>
                    Crear
                  </Button>
                  {!assessment && (
                    <Button variant="outlined" onClick={() => navigate('/wizard')}>
                      Ir al wizard
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={700}>
                Tus planes
              </Typography>
              {plans.length === 0 && (
                <Alert severity="info">Aun no tienes planes creados. Genera uno para empezar.</Alert>
              )}
              {plans.map((plan) => (
                <Card key={plan.id} elevation={0}>
                  <CardContent>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {plan.title ?? `Plan ${plan.days} dias`}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Inicio: {dayjs(plan.startDate).format('DD MMM YYYY')} · Duracion: {plan.days} dias
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button variant="outlined" onClick={() => navigate(`/plans/${plan.id}`)}>
                          Abrir
                        </Button>
                        <Button color="error" onClick={() => setDeleteTarget(plan)}>
                          Eliminar
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Grid>
        </Grid>
      </Stack>

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
