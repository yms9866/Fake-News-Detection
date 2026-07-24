const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

const uniquePaths = (...paths) => [...new Set(paths.filter(Boolean))];

config.watchFolders = uniquePaths(...(config.watchFolders || []), workspaceRoot);
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: uniquePaths(
    path.join(projectRoot, "node_modules"),
    path.join(workspaceRoot, "node_modules"),
    ...((config.resolver && config.resolver.nodeModulesPaths) || [])
  ),
  unstable_enableSymlinks: true
};

module.exports = config;
