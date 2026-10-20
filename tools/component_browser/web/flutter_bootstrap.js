{{flutter_js}}
{{flutter_build_config}}

_flutter.loader.load({
  onEntrypointLoaded: async (engineInitializer) => {
    try {
      window.componentLoading.stage('Preparing the preview canvas…');
      const appRunner = await engineInitializer.initializeEngine();
      window.componentLoading.stage('Opening the component catalog…');
      await appRunner.runApp();
    } catch (error) {
      console.error('Component browser initialization failed', error);
      window.componentLoading.fail();
    }
  },
}).catch((error) => {
  console.error('Component browser download failed', error);
  window.componentLoading.fail();
});
