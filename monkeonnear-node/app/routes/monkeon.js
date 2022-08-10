const express = require('express')
const router = express.Router()
const { SalesOfTheDay, HighestVOLGainers, Volumen24h } = require('../controllers/monkeon')

router.post('/salesoftheday', SalesOfTheDay)
router.post('/highestvolgainers', HighestVOLGainers)
router.post('/volumen24h', Volumen24h)

module.exports = router