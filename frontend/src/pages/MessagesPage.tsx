import { Alert, Box, Button, Card, CardContent, Chip, Container, Stack, TextField, Typography } from '@mui/material'
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getInboxMessages, markMessageAsRead, sendMemberMessage, type AppMessage } from '../lib/api'

const PAGE_SIZE = 20

type MessagesPageProps = {
  onUnreadCountRefresh?: () => void | Promise<void>
}

const MessagesPage = ({ onUnreadCountRefresh }: MessagesPageProps) => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getInboxMessages({ limit: PAGE_SIZE })
      setMessages(result.messages)
      setNextBefore(result.nextBefore ?? null)
      await onUnreadCountRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar mensajes')
    } finally {
      setLoading(false)
    }
  }, [onUnreadCountRefresh])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  const handleLoadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    setError(null)
    try {
      const result = await getInboxMessages({ limit: PAGE_SIZE, before: nextBefore })
      setMessages((prev) => [...prev, ...result.messages])
      setNextBefore(result.nextBefore ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar mas mensajes')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleOpenMessage = async (message: AppMessage) => {
    const isOwn = user?.id ? message.senderUserId === user.id : false
    if (isOwn || message.readAt) return
    setMarkingId(message.id)
    try {
      const updated = await markMessageAsRead(message.id)
      setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      await onUnreadCountRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar como leido')
    } finally {
      setMarkingId(null)
    }
  }

  const handleSendMessage = async () => {
    const body = messageText.trim()
    if (!body) {
      setError('Escribe un mensaje para enviar')
      return
    }

    setSending(true)
    setError(null)
    try {
      const created = await sendMemberMessage(body)
      setMessages((prev) => [created, ...prev])
      setMessageText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje')
    } finally {
      setSending(false)
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Mensajes
          </Typography>
          <Typography color="text.secondary">
            Conversacion con tu administradora.
          </Typography>
        </Box>

        <Card elevation={0}>
          <CardContent>
            <Stack spacing={1.25}>
              <TextField
                label="Nuevo mensaje"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                fullWidth
                multiline
                minRows={3}
                inputProps={{ maxLength: 1000 }}
                disabled={sending}
              />
              <Box display="flex" justifyContent="flex-end">
                <Button variant="contained" onClick={handleSendMessage} disabled={sending}>
                  {sending ? 'Enviando...' : 'Enviar'}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {error && <Alert severity="warning">{error}</Alert>}

        {loading ? (
          <Card elevation={0}>
            <CardContent>
              <Typography color="text.secondary">Cargando mensajes...</Typography>
            </CardContent>
          </Card>
        ) : messages.length === 0 ? (
          <Card elevation={0}>
            <CardContent>
              <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ py: 2 }}>
                <MailOutlineRoundedIcon color="disabled" />
                <Typography variant="subtitle1" fontWeight={700}>
                  Aun no tienes mensajes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Cuando tu administradora o tu envien mensajes, apareceran aqui.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={1.25}>
            {messages.map((message) => {
              const isOwn = user?.id ? message.senderUserId === user.id : false
              const isUnread = !isOwn && !message.readAt
              return (
                <Box key={message.id} display="flex" justifyContent={isOwn ? 'flex-end' : 'flex-start'}>
                  <Card
                    elevation={0}
                    onClick={() => handleOpenMessage(message)}
                    sx={{
                      width: { xs: '100%', sm: '85%' },
                      cursor: isUnread ? 'pointer' : 'default',
                      border: '1px solid',
                      borderColor: isUnread ? 'primary.light' : 'divider',
                      bgcolor: isOwn ? 'rgba(37, 99, 235, 0.08)' : 'common.white',
                    }}
                  >
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="caption" color="text.secondary">
                            {dayjs(message.createdAt).format('DD/MM/YYYY HH:mm')}
                          </Typography>
                          <Stack direction="row" spacing={0.75}>
                            <Chip
                              size="small"
                              label={isOwn ? 'Tu' : 'Admin'}
                              color={isOwn ? 'primary' : 'default'}
                              variant={isOwn ? 'filled' : 'outlined'}
                            />
                            {!isOwn && (
                              <Chip
                                size="small"
                                label={isUnread ? 'No leido' : 'Leido'}
                                color={isUnread ? 'warning' : 'default'}
                                variant={isUnread ? 'filled' : 'outlined'}
                              />
                            )}
                          </Stack>
                        </Stack>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                          {message.body}
                        </Typography>
                        {markingId === message.id && (
                          <Typography variant="caption" color="text.secondary">
                            Marcando como leido...
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              )
            })}
            {nextBefore && (
              <Box display="flex" justifyContent="center" pt={1}>
                <Button variant="outlined" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Cargando...' : 'Cargar mas'}
                </Button>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}

export default MessagesPage
