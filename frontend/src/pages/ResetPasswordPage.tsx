import {
  Alert,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../lib/api'

const ResetPasswordPage = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tokenFromUrl = params.get('token') ?? ''
  const emailFromUrl = params.get('email') ?? ''
  const [manualEmail, setManualEmail] = useState('')
  const [manualToken, setManualToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    const email = emailFromUrl || manualEmail.trim()
    const token = tokenFromUrl || manualToken.trim()
    if (!email || !token) {
      setError('Ingresa el email y el codigo de recuperacion.')
      return
    }
    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contrasenas no coinciden.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await resetPassword({ email, token, password })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contrasena.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
      <Card elevation={0}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4" fontWeight={800}>
              Restablecer contrasena
            </Typography>
            <Typography color="text.secondary">
              Crea una nueva contrasena para tu cuenta.
            </Typography>

            {error && <Alert severity="warning">{error}</Alert>}
            {success && (
              <Alert severity="success">
                Contrasena actualizada. Ya puedes iniciar sesion.
              </Alert>
            )}

            {!emailFromUrl && (
              <TextField
                label="Email"
                type="email"
                value={manualEmail}
                onChange={(event) => setManualEmail(event.target.value)}
                fullWidth
                disabled={success}
              />
            )}
            {!tokenFromUrl && (
              <TextField
                label="Codigo de recuperacion"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                fullWidth
                disabled={success}
              />
            )}

            <TextField
              label="Nueva contrasena"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              fullWidth
              disabled={success}
            />
            <TextField
              label="Confirmar contrasena"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              fullWidth
              disabled={success}
            />

            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading || success}
              fullWidth
            >
              {loading ? 'Guardando...' : 'Guardar contrasena'}
            </Button>

            <Button
              variant="text"
              onClick={() => navigate('/access')}
              fullWidth
            >
              Volver al acceso
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}

export default ResetPasswordPage
