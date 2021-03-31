// Native
const queryString = require('query-string');

// Packages
const { send } = require("micro");
const { valid, compare } = require("semver");
const { parse } = require("express-useragent");
const fetch = require("node-fetch");
const formatDistanceToNow = require("date-fns/formatDistanceToNow");

// Utilities
const checkAlias = require("./aliases");
const prepareView = require("./view");

module.exports = ({ cache, config }) => {
  const { loadCache } = cache;
  const exports = {};
  const { token } = config;
  let { url } = config;

  const shouldProxyPrivateDownload =
    token && typeof token === "string" && token.length > 0;

  // Helpers
  const proxyPrivateDownload = (asset, request, response) => {
    const redirect = "manual";
    const headers = { Accept: "application/octet-stream" };
    const options = { headers, redirect };
    const { api_url: url } = asset;

    if (shouldProxyPrivateDownload) {
      headers.Authorization = `token ${token}`;
    }

    fetch(url, options).then((assetResponse) => {
      response.setHeader("Location", assetResponse.headers.get("Location"));
      send(response, 302);
    });
  };

  exports.download = async (request, response) => {
    const userAgent = parse(request.headers["user-agent"]);
    const parameters = queryString.parse(request.url.split('?')[1])
    const isUpdate = parameters && parameters.update;

    let platform;

    if (userAgent.isMac && isUpdate) {
      platform = "darwin";
    } else if (userAgent.isMac && !isUpdate) {
      platform = "dmg";
    } else if (userAgent.isWindows) {
      platform = "exe";
    }

    // Get the latest version from the cache
    const { platforms } = await loadCache();

    if (!platform || !platforms || !platforms[platform]) {
      send(response, 404, "No download available for your platform!");
      return;
    }

    if (shouldProxyPrivateDownload) {
      proxyPrivateDownload(platforms[platform], request, response);
      return;
    }

    response.writeHead(302, {
      Location: platforms[platform].url,
    });

    response.end();
  };

  exports.downloadPlatform = async (request, response) => {
    const parameters = queryString.parse(request.url.split('?')[1])
    const isUpdate = parameters && parameters.update;

    let { platform } = request.params;

    if (platform === "mac" && !isUpdate) {
      platform = "dmg";
    }

    if (platform === "darwin") {
      platform = "dmg";
    }

    // Get the latest version from the cache
    const latest = await loadCache();

    // Check platform for appropiate aliases
    platform = checkAlias(platform);

    if (!platform) {
      send(response, 500, "The specified platform is not valid");
      return;
    }

    if (!latest.platforms || !latest.platforms[platform]) {
      send(response, 404, "No download available for your platform");
      return;
    }

    if (token && typeof token === "string" && token.length > 0) {
      proxyPrivateDownload(latest.platforms[platform], request, response);
      return;
    }

    response.writeHead(302, {
      Location: latest.platforms[platform].url,
    });

    response.end();
  };

  exports.update = async (request, response) => {
    const { platform: platformName, version, targetFile } = request.params;

    if (
      (!url || url.length === 0) &&
      request.headers["x-vercel-deployment-url"].length > 0
    ) {
      url = `https://${request.headers["x-vercel-deployment-url"]}`;
    }

    if (!valid(version)) {
      send(response, 500, {
        error: "version_invalid",
        message: "The specified version is not SemVer-compatible",
      });

      return;
    }

    const platform = checkAlias(platformName);

    if (!platform) {
      send(response, 500, {
        error: "invalid_platform",
        message: "The specified platform is not valid",
      });

      return;
    }

    // Get the latest version from the cache
    const latest = await loadCache();

    if (!latest.platforms || !latest.platforms[platform]) {
      response.statusCode = 204;
      response.end();

      return;
    }

    if (targetFile && shouldProxyPrivateDownload) {
      for (const platform in latest.platforms) {
        if (latest.platforms[platform].name === targetFile) {
          proxyPrivateDownload(latest.platforms[platform], request, response);
          break;
        }
      }

      return;
    }

    // Previously, we were checking if the latest version is
    // greater than the one on the client. However, we
    // only need to compare if they're different (even if
    // lower) in order to trigger an update.

    // This allows developers to downgrade their users
    // to a lower version in the case that a major bug happens
    // that will take a long time to fix and release
    // a patch update.

    if (compare(latest.version, version) !== 0) {
      const { notes, pub_date } = latest;

      send(response, 200, {
        name: latest.version,
        notes,
        pub_date,
        url: shouldProxyPrivateDownload
          ? `${url}/download/${platformName}?update=true`
          : latest.platforms[platform].url,
      });

      return;
    }

    response.statusCode = 204;
    response.end();
  };

  exports.releases = async (request, response) => {
    // Get the latest version from the cache
    const latest = await loadCache();

    if (!latest.files || !latest.files.RELEASES) {
      response.statusCode = 204;
      response.end();

      return;
    }

    const content = latest.files.RELEASES;

    response.writeHead(200, {
      "content-length": Buffer.byteLength(content, "utf8"),
      "content-type": "application/octet-stream",
    });

    response.end(content);
  };

  exports.overview = async (request, response) => {
    const latest = await loadCache();

    try {
      const render = await prepareView();

      const details = {
        account: config.account,
        repository: config.repository,
        date: formatDistanceToNow(new Date(latest.pub_date), {
          addSuffix: true,
        }),
        files: latest.platforms,
        version: latest.version,
        releaseNotes: `https://github.com/${config.account}/${config.repository}/releases/tag/${latest.version}`,
        allReleases: `https://github.com/${config.account}/${config.repository}/releases`,
        github: `https://github.com/${config.account}/${config.repository}`,
      };

      send(response, 200, render(details));
    } catch (error) {
      console.error(error);
      send(response, 500, "Error reading overview file");
    }
  };

  return exports;
};
