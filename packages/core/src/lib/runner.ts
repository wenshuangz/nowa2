import { Module } from './core/module';
import { Runnable } from './core/runnable';
import { ModuleQueue } from './moduleQueue';
import { IConfig, IConfigConfigValues, IPlugin, ISolution, ISolutionCommandDescription, IUtils } from './types';
import { captureStack } from './utils';

export class Runner extends Runnable.Callback<Runner.PluginGroup> {
  public runtime: Runner.IRuntime = { parsed: {}, raw: {} } as any;
  public utils: Runner.Utils;
  constructor(public $createUtils: Runner.UtilsCreator) {
    super();
    this.utils = $createUtils('Runner');
  }
  public async init(): Promise<void> {
    const { logger } = this.utils;
    try {
      logger.debug('apply init-start');
      await this.$applyHook('init-start');
      logger.debug('apply init-context');
      this.runtime.context = await this.$applyHookBail('init-context');
      logger.debug('apply load-advanced-config');
      const advanced = await this.$applyHookBail('load-advanced', { context: this.runtime.context });
      if (advanced) {
        const advancedPlugins = await this.$applyHookBail('load-plugins', {
          config: advanced.config,
          context: this.runtime.context,
          solution: advanced.solution,
        });
        logger.debug(`load ${advancedPlugins.length} advanced plugin(s)`);
        for (const plugin of advancedPlugins) {
          await plugin.apply(this, this.$createUtils(plugin.name));
        }
      }
      logger.debug('apply load-config');
      this.runtime.raw.config = await this.$applyHookBail('load-config', { context: this.runtime.context });
      logger.debug('apply load-solution');
      this.runtime.raw.solution = await this.$applyHookBail('load-solution', {
        config: this.runtime.raw.config,
        context: this.runtime.context,
      });
      logger.debug('apply load-plugins');
      const plugins = await this.$applyHookBail('load-plugins', {
        config: this.runtime.raw.config,
        context: this.runtime.context,
        solution: this.runtime.raw.solution,
      });
      logger.debug(`load ${plugins.length} plugin(s) from config and solution`);
      for (const plugin of plugins) {
        await plugin.apply(this, this.$createUtils(plugin.name));
      }
      logger.debug('apply load-commands');
      this.runtime.raw.commands = await this.$applyHookBail('load-commands', {
        config: this.runtime.raw.config,
        context: this.runtime.context,
        solution: this.runtime.raw.solution,
      });
      logger.debug('apply parse-config');
      this.runtime.parsed.config = await this.$applyHookBail('parse-config', {
        commands: this.runtime.parsed.commands,
        context: this.runtime.context,
        ...this.runtime.raw,
      });
      logger.debug('apply parse-solution');
      const solutionResult = await this.$applyHookBail('parse-solution', {
        commands: this.runtime.parsed.commands,
        context: this.runtime.context,
        ...this.runtime.raw,
      });
      this.runtime.parsed.solution = solutionResult;
      logger.debug('apply load-options');
      const options = await this.$applyHookBail('load-options', {
        commands: this.runtime.parsed.commands,
        config: this.runtime.parsed.config,
        context: this.runtime.context,
        rawConfig: this.runtime.raw.config,
        rawSolution: this.runtime.raw.solution,
        solution: this.runtime.parsed.solution,
      });
      const logOptionsWarning = (message: string) => {
        logger.warn(message);
        logger.debug(captureStack(message));
      };
      this.runtime.parsed.options = new Proxy(options, {
        get(t, p) {
          if (!t.hasOwnProperty(p)) {
            logOptionsWarning('used a non-exist options property');
          }
          return (t as any)[p];
        },
        set(t, p, v) {
          logOptionsWarning('should not modify options property');
          return Reflect.set(t, p, v);
        },
        deleteProperty(t, p) {
          logOptionsWarning('should not delete options property');
          return Reflect.deleteProperty(t, p);
        },
      });
      logger.debug('apply load-modules');
      this.runtime.modules = await this.$applyHookBail('load-modules', {
        context: this.runtime.context,
        createUtils: this.$createUtils,
        ...this.runtime.parsed,
      });
      logger.debug(`load ${this.runtime.modules.length} module(s)`);
      logger.debug('create & init moduleQueue');
      this.runtime.moduleQueue = new ModuleQueue(this.runtime.modules, this.$createUtils('ModuleQueue'));
      logger.debug('apply init-module-queue');
      await this.$applyHook('init-module-queue', {
        context: this.runtime.context,
        moduleQueue: this.runtime.moduleQueue,
        modules: this.runtime.modules,
        ...this.runtime.parsed,
      });
      await this.runtime.moduleQueue.init();
      logger.debug('apply init-end');
      await this.$applyHook('init-end', this);
    } catch (e) {
      logger.debug(`apply init-error because of ${e}`);
      await this.$applyHook('init-error', { error: e });
    }
  }

  public async run(): Promise<void> {
    let isFirstRun = true;
    const { logger } = this.utils;
    process.on('SIGINT', () => {
      logger.debug('signal SIGINT received');
      logger.debug('apply run-end');
      this.$applyHook('run-end', this).then(() => process.exit(0));
    });
    logger.debug('apply run-start');
    await this.$applyHook('run-start', this);
    logger.debug('run modules');
    await this.runtime.moduleQueue.run(() => {
      logger.debug('apply run-end');
      this.$applyHook('run-end', this);
      if (isFirstRun) {
        logger.debug('apply first-run-end');
        this.$applyHook('first-run-end', this);
        isFirstRun = false;
      }
    });
  }
}

export namespace Runner {
  export type PluginGroup = {
    'init-start': [undefined, void];
    'init-context': [undefined, IRuntime['context']];
    'load-advanced': [
      Pick<IRuntime, 'context'>,
      { config: IRuntime['raw']['config']; solution: IRuntime['raw']['solution'] } | null
    ];
    'load-config': [Pick<IRuntime, 'context'>, IRuntime['raw']['config']];
    'load-solution': [Pick<IRuntime, 'context'> & Pick<IRuntime['raw'], 'config'>, IRuntime['raw']['solution']];
    'load-plugins': [Pick<IRuntime, 'context'> & Partial<Pick<IRuntime['raw'], 'config' | 'solution'>>, Array<IPlugin<Runner>>];
    'load-commands': [Pick<IRuntime, 'context'> & Pick<IRuntime['raw'], 'config' | 'solution'>, IRuntime['raw']['commands']];
    'parse-config': [Pick<IRuntime, 'context'> & IRuntime['raw'], IRuntime['parsed']['config']];
    'parse-solution': [Pick<IRuntime, 'context'> & IRuntime['raw'], IRuntime['parsed']['solution']];
    'load-options': [
      Pick<IRuntime, 'context'> &
        Pick<IRuntime['parsed'], 'commands' | 'config' | 'solution'> & {
          rawConfig: IRuntime['raw']['config'];
          rawSolution: IRuntime['raw']['solution'];
        },
      IRuntime['parsed']['options']
    ];
    'load-modules': [Pick<IRuntime, 'context'> & IRuntime['parsed'] & { createUtils: Runner.UtilsCreator }, IRuntime['modules']];
    'init-module-queue': [
      Pick<IRuntime, 'context'> & IRuntime['parsed'] & { modules: IRuntime['modules']; moduleQueue: IRuntime['moduleQueue'] },
      void
    ];
    'init-end': [Runner, void];
    'run-start': [Runner, void];
    'first-run-end': [Runner, void];
    'run-end': [Runner, void];
    'init-error': [{ error: any }, void];
    'run-error': [{ error: any }, void];
  };

  export type UtilsCreator = (name?: string) => IUtils;

  export type Utils = IUtils;

  export interface IRuntime {
    context: string;
    raw: {
      config: IConfig;
      solution: ISolution;
      commands: string[];
    };
    parsed: {
      config: IConfigConfigValues;
      solution: ISolutionCommandDescription;
      commands: string[];
      options: object;
    };
    modules: Module.InstanceType[];
    moduleQueue: ModuleQueue;
  }
}
