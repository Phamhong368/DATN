import express from 'express'
import dotenv from 'dotenv'
import depotRoutes from './routes/depotRoutes.js'
import authRoutes from './routes/authRoutes.js'
import truckRoutes from './routes/truckRoutes.js'
import driverRoutes from './routes/driverRoutes.js'
import customerRoutes from './routes/customerRoutes.js'
import orderRoutes from './routes/orderRoutes.js'
import tripRoutes from './routes/tripRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import optimizerRoutes from './routes/optimizerRoutes.js'
import analyticsRoutes from './routes/analyticsRoutes.js'
import userRoutes from './routes/userRoutes.js'
import { authenticate, authorize } from './middleware/auth.js'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()
const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Mount API routes
app.use('/api/depots', depotRoutes)
app.use('/auth', authRoutes)
app.use('/trucks', authenticate, authorize('DISPATCHER'), truckRoutes)
app.use('/drivers', authenticate, authorize('DISPATCHER'), driverRoutes)
app.use('/customers', authenticate, authorize('DISPATCHER'), customerRoutes)
app.use('/orders', authenticate, authorize('DISPATCHER'), orderRoutes)
app.use('/trips', authenticate, tripRoutes)
app.use('/reports', authenticate, authorize('DISPATCHER'), reportRoutes)
app.use('/optimizer', authenticate, authorize('DISPATCHER'), optimizerRoutes)
app.use('/analytics', authenticate, authorize('DISPATCHER'), analyticsRoutes)
app.use('/users', authenticate, authorize('ADMIN'), userRoutes)

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({
    message: error.message || 'Internal server error.'
  })
})

export default app
