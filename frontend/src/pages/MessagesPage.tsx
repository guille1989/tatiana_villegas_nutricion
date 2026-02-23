import { Alert, Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material'
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { getInboxMessages, markMessageAsRead, type AppMessage } from '../lib/api'

const PAGE_SIZE = 20

type MessagesPageProps = {
  onUnreadCountRefresh?: () => void | Promise<void>
}

const MessagesPage = ({ onUnreadCountRefresh }: MessagesPageProps) => {
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)

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
    if (message.readAt) return
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

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Mensajes
          </Typography>
          <Typography color="text.secondary">
            Comunicaciones enviadas por tu administradora.
          </Typography>
        </Box>

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
                  Cuando tu administradora te envie un mensaje lo veras aqui.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={1.25}>
            {messages.map((message) => {
              const isUnread = !message.readAt
              return (
                <Card
                  key={message.id}
                  elevation={0}
                  onClick={() => handleOpenMessage(message)}
                  sx={{
                    cursor: isUnread ? 'pointer' : 'default',
                    border: '1px solid',
                    borderColor: isUnread ? 'primary.light' : 'divider',
                    bgcolor: isUnread ? 'rgba(37, 99, 235, 0.03)' : 'common.white',
                  }}
                >
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {dayjs(message.createdAt).format('DD/MM/YYYY HH:mm')}
                        </Typography>
                        <Chip
                          size="small"
                          label={isUnread ? 'No leido' : 'Leido'}
                          color={isUnread ? 'warning' : 'default'}
                          variant={isUnread ? 'filled' : 'outlined'}
                        />
                      </Stack>
                      <Typography variant="body1">{message.body}</Typography>
                      {markingId === message.id && (
                        <Typography variant="caption" color="text.secondary">
                          Marcando como leido...
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
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
