// Packages
const Router = require('router')
const finalhandler = require('finalhandler')
const Cache = require('./cache')

module.exports = config => {
  const router = Router()
  let cache = null;

  try {
    cache = new Cache(config)
  } catch (error) {
    const { code, message } = error

    if (code) {
      return (request, response) => {
        response.statusCode = 400;

        response.end(JSON.stringify({
          error: {
            code,
            message
          }
        }))
      }
    }

    throw error
  }

  const routes = require('./routes')({ cache, config })

  // Define a route for every relevant path
  router.get('/', routes.overview)
  router.get('/download', routes.download)
  router.get('/download/:platform', routes.downloadPlatform)
  router.get('/update/:platform/:version', routes.update)
  router.get('/update/:platform/:version/:targetFile', routes.update)
  router.get('/update/win32/:version/RELEASES', routes.releases)

  return (request, response) => {
    router(request, response, finalhandler(request, response))
  }
}
