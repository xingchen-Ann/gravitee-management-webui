/*
 * Copyright (C) 2015 The Gravitee team (http://gravitee.io)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import ThemeService from '../../../services/theme.service';
import NotificationService from '../../../services/notification.service';
import { Theme } from '../../../entities/theme';

class ThemeController {

  detachedWindow: Window;
  connected = false;
  private connectionRequestInterval: NodeJS.Timer;

  private currentHref: any;

  constructor(private $http,
              private $scope,
              private $mdDialog,
              private Constants,
              private ThemeService: ThemeService,
              private NotificationService: NotificationService) {
    $scope.themeForm = {};
    $scope.targetURL = Constants.portal.url;
    $scope.previewName = 'GvPreviewName';
    $scope.buttonConfig = {
      hasBackdrop: true,
      clickOutsideToClose: true,
      materialPalette: false,
      history: true,
      clearButton: false
    };

    $scope.fonts = [
      'Arial, Helvetica, \'Liberation Sans\', FreeSans, sans-serif',
      '\'Trebuchet MS\', Arial, Helvetica, sans-serif',
      '\'Lucida Sans\', \'Lucida Grande\', \'Lucida Sans Unicode\', \'Luxi Sans\', sans-serif',
      'Tahoma, Geneva, Kalimati, sans-serif',
      'Verdana, DejaVu Sans, Bitstream Vera Sans, Geneva, sans-serif',
      'Impact, Arial Black, sans-serif',
      'Courier, \'Courier New\', FreeMono, \'Liberation Mono\', monospace',
      'Monaco, \'DejaVu Sans Mono\', \'Lucida Console\', \'Andale Mono\', monospace',
      'Times, \'Times New Roman\', \'Liberation Serif\', FreeSerif, serif',
      'Georgia, \'DejaVu Serif\', Norasi, serif',
    ];

    $scope.getThemeVariables = (filter) => {
      const themeComponent = this.$scope.theme ? this.$scope.themeComponent : {};
      if (themeComponent.css) {
        if (filter) {
          return themeComponent.css.filter(filter);
        } else {
          return themeComponent.css;
        }
      }
      return [];
    };

    $scope.$on('accordion:onReady', function() {
      $scope.accordion.toggle('image');
    });

    $scope.getGlobalColorVariables = () => {
      return this.$scope.getThemeVariables((prop) => {
        return prop.type === 'color' && prop.name.startsWith('--gv-theme-font-color');
      });
    };

    $scope.getGlobalPrimaryColorVariables = () => {
      return this.$scope.getThemeVariables((prop) => {
        return prop.type === 'color' && prop.description.includes('Primary');
      });
    };

    $scope.getGlobalNeutralColorVariables = () => {
      return this.$scope.getThemeVariables((prop) => {
        return prop.type === 'color' && prop.name.startsWith('--gv-theme-neutral-color');
      });
    };

    $scope.getGlobalFontFamilyVariables = () => {
      return this.$scope.getThemeVariables((prop) => {
        return prop.name.startsWith('--gv-theme-font-family');
      });
    };

    $scope.getGlobalFontSizeVariables = () => {
      return this.$scope.getThemeVariables((prop) => {
        return prop.name.startsWith('--gv-theme-font-size');
      });
    };

    $scope.getComponents = () => {
      if ($scope.theme) {
        return $scope.theme.definition.data.filter((element) => element.name !== 'gv-theme');
      }
      return [];
    };

    window.addEventListener('message', this.handleEvent.bind(this), false);
    this.loadTheme().then(() => {
      this.connectionRequest();
      $scope.href = $scope.targetURL + this.getQueryParams();
    });
    $scope.isDetached = false;
    setInterval(() => {
      this.getWindow().postMessage(this.getData(), $scope.targetURL);
    }, 30000);

    $scope.$on('apiPictureChangeSuccess', (event, args) => {
      setTimeout(() => {
        this.onDataChanged();
      }, 0);
    });

    $scope.getOptionalLogo = () => {
      if ($scope.theme) {
        if ($scope.theme.optionalLogo) {
          return $scope.theme.optionalLogo;
        } else {
          return $scope.theme.logo;
        }
      }
      return '';
    };
  }

  getDisplayName(name) {
    return name.replace('gv-', '').replace('-', ' ');
  }

  getQueryParams() {
    return '?preview=on';
  }

  getData = (data = {}) => {
    const theme = this.$scope.theme;
    if (theme.optionalLogo == null) {
      theme.optionalLogo = theme.logo;
    }
    return Object.assign({}, {
      type: 'gravitee',
      theme,
      isDetached: this.$scope.isDetached,
      date: Date.now()
    }, data);
  }

  getValue(property) {
    if (property.value.startsWith('var(')) {
      return '';
    }
    return property.value;
  }

  getColorTitle(property) {
    let value = property.value;
    if (property.value === '' && property.default.startsWith('var(')) {
      const parentProperty = property.default.split(',')[0].replace('var(', '');
      const parentCss = this.$scope.themeComponent.css.find((p) => p.name === parentProperty);
      if (parentCss) {
        value = `(inherited from ${ parentCss.description })`;
      } else {
        console.warn('parentCss not found', parentProperty);
      }
    }
    return `${ property.description }: ${ value }`;
  }

  hasColors(component) {
    return component.css.find(p => p.type.toLowerCase() === 'color') != null;
  }

  getPlaceholder(property) {
    if (property.value === '' && property.default.startsWith('var(')) {
      const parentProperty = property.default.split(',')[0].replace('var(', '');
      const parentCss = this.$scope.themeComponent.css.find((p) => p.name === parentProperty);
      return `Use ${ parentCss.description }: ${ parentCss.value }`;
    }
    return property.description;
  }

  getWindow = () => {
    if (!this.$scope.isDetached) {
      this.detachedWindow = null;
      const iframe = document.getElementById('preview');
      if (!iframe) {
        console.warn('iframe "preview" not found');
        return null;
      }
      // @ts-ignore
      return iframe.contentWindow;
    }
    return this.detachedWindow;
  }

  connectionRequest = () => {
    this.connectionRequestInterval = setInterval(() => {
      if (this.getWindow() && !this.connected) {
        this.getWindow().postMessage(this.getData({ requestAnswer: true }), '*');
      }
    }, 500);
  }

  handleEvent = (event) => {
    if (event.data.type === 'gravitee') {
      if (this.connectionRequestInterval) {
        clearInterval(this.connectionRequestInterval);
        this.connectionRequestInterval = null;
        this.connected = true;
      }
      if (event.data.href) {
        this.currentHref = event.data.href;
      }

      if (event.data.unload && this.$scope.isDetached) {
        this.$scope.$apply(() => {
          this.$scope.href = this.currentHref + this.getQueryParams();
          this.$scope.isDetached = false;
          this.connected = false;
          this.connectionRequest();
        });
      }
    }
  }

  open = () => {
    if (!this.$scope.isDetached) {
      this.$scope.isDetached = true;
      setTimeout(() => {
        // Wait after last currentHref...
        this.connected = false;
        this.detachedWindow = window.open(this.currentHref + this.getQueryParams(),
          this.$scope.previewName,
          `width=1024, height=${ window.screen.height }, left=${ window.screen.width - 1024 }`);
        this.connectionRequest();
      }, 500);
      this.$scope.accordion.expandAll();

    } else {
      this.detachedWindow.close();
    }
  }

  setTheme(theme) {
    this.$scope.theme = theme;
    this.$scope.themeComponent = theme.definition.data.find((element) => element.name === 'gv-theme');
  }

  loadTheme = () => {
    return this.ThemeService.get().then((response) => {
      const theme: Theme = response.data;
      this.setTheme(theme);
    });
  }

  reset = () => {
    this.loadTheme().then(() => {
      this.NotificationService.show('The theme has been reset.');
      this.getWindow().postMessage(this.getData(), this.$scope.targetURL);
    });
  }

  restoreDefaultTheme = () => {
    let confirm = this.$mdDialog.confirm({
      title: 'Restore default theme ?',
      content: 'Are you sure you want to restore the default theme? All your changes will be deleted.',
      ok: 'RESTORE',
      cancel: 'CANCEL'
    });
    this.$mdDialog.show(confirm).then(() => {
      this.ThemeService.restoreDefaultTheme(this.$scope.theme).then((response) => {
        const theme: Theme = response.data;
        this.setTheme(theme);
        this.onDataChanged();
        this.$scope.themeForm.$commitViewValue();
        this.$scope.themeForm.$setSubmitted();
        this.$scope.themeForm.$setPristine();
        this.NotificationService.show('The "Gravitee" default theme has been restore.');
      });
      // tslint:disable-next-line:no-empty
    }, () => {
    });

  }

  getLogoUrl() {
    if (this.$scope.theme) {
      return this.ThemeService.getLogoUrl(this.$scope.theme);
    }
    return '';
  }

  getOptionalLogoUrl() {
    if (this.$scope.theme) {
      if (this.$scope.theme.optionalLogo) {
        return this.ThemeService.getOptionalLogoUrl(this.$scope.theme);
      } else {
        return this.getLogoUrl();
      }
    }
    return '';
  }

  getBackgroundImageUrl() {
    if (this.$scope.theme) {
      return this.ThemeService.getBackgroundImageUrl(this.$scope.theme);
    }
    return '';
  }

  getLoaderUrl() {
    if (this.$scope.theme) {
      return this.ThemeService.getLoaderUrl(this.$scope.theme);
    }
    return '';
  }

  update = () => {
    this.ThemeService.update(this.$scope.theme).then(() => {
      this.$scope.themeForm.$setPristine();
      this.NotificationService.show('The theme has been saved.');
    });
  }

  onDataChanged = () => {
    this.getWindow().postMessage(this.getData(), this.$scope.targetURL);
  }

}

export default ThemeController;
