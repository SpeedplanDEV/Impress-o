import { Router } from 'express'
import { assetsRouter } from './assets.js'
import { companiesRouter, departmentsRouter } from './companies.js'
import { personsRouter } from './persons.js'
import { templatesRouter } from './templates.js'
import { cardsRouter } from './cards.js'
import { printersRouter } from './printers.js'
import { printRouter } from './print.js'
import { costRouter } from './cost.js'
import { settingsRouter } from './settings.js'

/** Agregador das rotas autenticadas. */
export const apiRouter = Router()

apiRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})
apiRouter.use('/assets', assetsRouter)
apiRouter.use('/companies', companiesRouter)
apiRouter.use('/departments', departmentsRouter)
apiRouter.use('/persons', personsRouter)
apiRouter.use('/templates', templatesRouter)
apiRouter.use('/cards', cardsRouter)
apiRouter.use('/printers', printersRouter)
apiRouter.use('/print', printRouter)
apiRouter.use('/cost', costRouter)
apiRouter.use('/settings', settingsRouter)
