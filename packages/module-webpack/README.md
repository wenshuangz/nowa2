# nowa-module-webpack

## Module Config

```ts
export interface IOptions {
  mode?: 'run' | 'watch' | 'devServer';
}
export type ConfigFileContent =
  | ((
      { context, options }: { context: string; options: object },
    ) => Webpack.Configuration | Webpack.Configuration[] | Promise<Webpack.Configuration | Webpack.Configuration[]>)
  | Webpack.Configuration
  | Webpack.Configuration[];
export type SingleConfig = /* path to configFile */ string | ConfigFileContent;
export type Config = ['webpack', SingleConfig | SingleConfig[], IOptions | undefined];
```

## Usage

```js
const config1 = ['webpack', 'sompath/webpack.config.js']; // config file
const config2 = ['webpack', ['sompath/webpack.app.js', 'sompath/webpack.page.js']]; // MultiCompiler
const config3 = ['webpack', { entry: './src/index.js', ...otherWebpackConfig }]; // raw config
const config4 = ['webpack', { watch: true, ...o }]; // watch mode
const config5 = ['webpack', { devServer: { ...d }, ...o }]; // devServer mode
const config6 = ['webpack', { devServer: { ...d }, ...o }, { mode: 'run' }]; // run mode (ignore devServer)
```

## Mode

there are 3 modes now

* webpack run
* webpack watch
* webpack-dev-server

if `mode` is not set, `module-webpack` will decide it directly from the final config.

1. `config.devServer` is truthy => webpack-dev-server
1. `config.watch` is truthy => webpack watch source files and changes triggers recompile
1. else => simple webpack build

## Function Type Webpack Config

Webpack supports [exporting a function as a config](https://webpack.js.org/configuration/configuration-types/#exporting-a-function).
But its hard to use.

Therefore, `module-webpack` replace that support with a more advanced solution.

Instead of `function (env, argv) {}` from native webapck, `module-webapck` supports `function ({ context, options }) {}`

* string `context` is the project root (`context` in `nowa2`)
* object `options` is the `nowa options` from your command line arguments, config and solution

### Examples

```shell
nowa2 xxxx --language en --multiPage true
```

```js
const config1 = [
  'webpack',
  {
    config: ({ context, options }) => ({
      context,
      entry: `./src/index.${options.language}.js`, // ./src/index.en.js
      ...otherWebpackConfig,
    }),
  },
];
```

```js
const config2 = ['webpack', 'sompath/webpack.config.js'];
```

with `sompath/webpack.config.js`

```js
module.exports = async ({ context, options }) => {
  if (option.multiPage /* true */) {
    // ...
  }
  // ...
};
```

## Overwrite Final Webpack Config

In some cases we need modify `webpack` config, but we cannot change `nowa soltion` directly (in a npm package).

We can create a `webpack.config.js` in project root. In this file you can access then final webpack config and return a new one to replace it.

This file can export a fucntion, the function signature is `function (originalConfig, rumtime, webpack) {}`

* originalConfig is the final config generated by `nowa`, will be passed to webpack soon
* runtime is a object with properties
  > * string `context`
  > * object `options`
  > * Array<string> `commands` is the actual command you type  
  >   e.g. `nowa2 build prod` => `['build', 'prod']`
  > * object `config` is the module config for `module-webpack` in you `solution`

it also supports specify which command the overwrite will take place like `config` / `solution`

### Examples

```js
module.exports = (config, rumtime, webpack) => {
  // overwrite all command using module-webpack
  config.plugins.push(new webpack.SomeBuiltinPlugin());
  return config;
};
```

```js
module.exports = {
  // export an object instead of fucntion
  build: [
    (config, rumtime, webpack) => {
      // overwrite on build command only
      config.plugins.push(new webpack.SomeBuiltinPlugin());
      return config;
    },
  ],
  dev: [
    (config, rumtime, webpack) => {
      // overwrite on dev command only
      config.plugins.push(new webpack.SomeOtherBuiltinPlugin());
      return config;
    },
  ],
};
```
