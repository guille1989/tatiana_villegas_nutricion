import {
  Alert,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { bootstrapAdmin, claimInvite, login as loginApi } from '../lib/api'

const AccessPage = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [adminMode, setAdminMode] = useState(false)
  const [adminSecret, setAdminSecret] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Ingresa tu codigo')
      return
    }
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError('Ingresa tu email')
      return
    }
    if (!password) {
      setError('Ingresa tu contrasena')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await claimInvite(trimmed, {
        name: name.trim() || undefined,
        email: trimmedEmail,
        password,
      })
      login(result.token, result.user)
      const nextRoute = result.user.role === 'admin' ? '/admin' : '/wizard'
      navigate(nextRoute, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    const trimmedEmail = loginEmail.trim().toLowerCase()
    if (!trimmedEmail || !loginPassword) {
      setLoginError('Ingresa tu email y contrasena')
      return
    }
    setLoginLoading(true)
    setLoginError(null)
    try {
      const result = await loginApi({ email: trimmedEmail, password: loginPassword })
      login(result.token, result.user)
      const nextRoute = result.user.role === 'admin' ? '/admin' : '/wizard'
      navigate(nextRoute, { replace: true })
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'No se pudo iniciar sesion')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleBootstrapAdmin = async () => {
    const secret = adminSecret.trim()
    if (!secret) {
      setAdminError('Ingresa el BOOTSTRAP_SECRET')
      return
    }
    if (adminPassword && adminPassword.length < 6) {
      setAdminError('La contrasena debe tener al menos 6 caracteres')
      return
    }
    setAdminLoading(true)
    setAdminError(null)
    try {
      const result = await bootstrapAdmin({
        secret,
        name: adminName.trim() || undefined,
        email: adminEmail.trim() || undefined,
        password: adminPassword || undefined,
      })
      login(result.token, result.user)
      navigate('/admin', { replace: true })
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'No se pudo crear admin')
    } finally {
      setAdminLoading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
      <Card elevation={0}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4" fontWeight={800}>
              Acceso
            </Typography>
            <Typography color="text.secondary">
              Ingresa tu codigo o inicia sesion con tus credenciales.
            </Typography>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Acceso con codigo
              </Typography>
              {error && <Alert severity="warning">{error}</Alert>}
              <TextField
                label="Codigo de acceso"
                placeholder="Ej: 1A2B3C4D"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                fullWidth
              />
              <TextField
                label="Nombre (opcional)"
                value={name}
                onChange={(event) => setName(event.target.value)}
                fullWidth
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                fullWidth
              />
              <TextField
                label="Contrasena"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                fullWidth
              />
              <Button variant="contained" onClick={handleSubmit} disabled={loading} fullWidth>
                {loading ? 'Validando...' : 'Entrar con codigo'}
              </Button>
            </Stack>

            <Divider />

            <Stack spacing={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Ya tengo cuenta
              </Typography>
              {loginError && <Alert severity="warning">{loginError}</Alert>}
              <TextField
                label="Email"
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                fullWidth
              />
              <TextField
                label="Contrasena"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                fullWidth
              />
              <Button variant="contained" onClick={handleLogin} disabled={loginLoading} fullWidth>
                {loginLoading ? 'Ingresando...' : 'Iniciar sesion'}
              </Button>
            </Stack>

            <Divider />

            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Crear admin (solo primera vez)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Usa el BOOTSTRAP_SECRET definido en el backend para crear el primer admin.
              </Typography>
              {adminError && <Alert severity="warning">{adminError}</Alert>}
              <Button
                variant={adminMode ? 'outlined' : 'text'}
                onClick={() => {
                  setAdminMode((prev) => !prev)
                  setAdminError(null)
                }}
              >
                {adminMode ? 'Ocultar formulario' : 'Quiero crear admin'}
              </Button>
              {adminMode && (
                <Stack spacing={1.5}>
                  <TextField
                    label="BOOTSTRAP_SECRET"
                    type="password"
                    value={adminSecret}
                    onChange={(event) => setAdminSecret(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Nombre (opcional)"
                    value={adminName}
                    onChange={(event) => setAdminName(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Email (opcional)"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Contrasena (opcional)"
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    fullWidth
                  />
                  <Button variant="contained" onClick={handleBootstrapAdmin} disabled={adminLoading} fullWidth>
                    {adminLoading ? 'Creando...' : 'Crear admin'}
                  </Button>
                </Stack>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}

export default AccessPage
