/*jslint node:true, nomen:true*/
(function () {

	'use strict';

	// Node modules
	var fs = require('fs'),
	path = require('path'),
	http = require('http'),
	fstream = require('fstream'),

	// Other modules
	async = require('async'),
	Client = require('node-rest-client').Client,
	unzip = require('unzip'),
	metaparser = require('metaparser'),
	mkdirp = require('mkdirp'),
	mergeDefaults = require('merge-defaults'),

	// placeholder
	print;

	var _defaults = {
		"files" : {
			"src" : null,
			"dest" : null,
			"html" : null,
			"iconsPath" : null,
			"androidManifest" : null,
			"browserConfig" : null,
			"firefoxManifest" : null,
			"yandexManifest" : null
		},
		"icons" : {
			"android" : true,
			"appleIcon" : true,
			"appleStartup" : true,
			"coast" : true,
			"favicons" : true,
			"firefox" : true,
			"opengraph" : true,
			"windows" : true,
			"yandex" : true
		},
		"settings" : {
			"appName" : null,
			"appDescription" : null,
			"developer" : null,
			"developerURL" : null,
			"background" : "#ddd",
			"index" : null,
			"url" : null,
			"silhouette" : false,
			"version" : 1.0,
			"config" : null,
			"logging" : false
		},
		"favicon_generation" : null
	};
    var _tags = {
        "add": [],
        "remove": [
            "link[rel='shortcut icon']",
            "link[rel='icon']",
            "link[rel^='apple-touch-icon']",
            "link[rel='manifest']",
            "link[rel='yandex-tableau-widget']",
            "link[rel='apple-touch-startup-image']",
            "meta[name^='msapplication']",
            "meta[name='mobile-web-app-capable']",
            "meta[name='theme-color']",
            "meta[name='apple-mobile-web-app-capable']",
            "meta[property='og:image']",
            "link[rel='favicons']"
        ]
    };
	var _config = {
		"data" : {
			"favicon_generation" : {
				"api_key" : "aa614a026473a54401ac101b24201145dc006876",
				"master_picture" : {
					"type" : "inline"
				},
				"files_location" : {
					"type" : "root"
				},
				"favicon_design" : {
					"desktop_browser" : {},
					"ios" : {
						"picture_aspect" : "background_and_margin",
						"margin" : "4",
						"background_color" : "#ddd",
						"startup_image" : {
							"master_picture" : {},
							"background_color" : "#ddd"
						}
					},
					"windows" : {
						"picture_aspect" : "white_silhouette",
						"background_color" : "#ddd"
					},
					"firefox_app" : {
						"picture_aspect" : "circle",
						"keep_picture_in_circle" : "true",
						"circle_inner_margin" : "5",
						"background_color" : "#ddd",
						"manifest" : {}
					},
					"android_chrome" : {
						"picture_aspect" : "shadow",
						"manifest" : {
							"display" : "standalone",
							"orientation" : "portrait"
						},
						"theme_color" : "#ddd"
					},
					"coast" : {
						"picture_aspect" : "background_and_margin",
						"background_color" : "#ddd",
						"margin" : "12%"
					},
					"open_graph" : {
						"picture_aspect" : "background_and_margin",
						"background_color" : "#ddd",
						"margin" : "12%",
						"ratio" : "1.91:1"
					},
					"yandex_browser" : {
						"background_color" : "#ddd",
						"manifest" : {
							"show_title" : true
						}
					}
				},
				"settings" : {
					"compression" : "3",
					"scaling_algorithm" : "Mitchell",
					"error_on_image_too_small" : true
				}
			}
		},
		"headers" : {
			"Content-Type" : "application/json"
		}
	};
    
    module.exports = RealFavicon;
    function RealFavicon(params, callback){
        this.getConfig = getConfig;
        var config = getConfig(params);
        async.waterfall([
            function settingIcons(callback) {
                print('\nSetting icons');
                setIcons(config, config.files.src, function (error) {
                    return callback(error);
                });
            },
            function (callback) {
                print('\nGenerating favicons');
                var dest = path.normalize(config.files.dest);
                mkdirp(dest, function (error) {
                    if (error){
                        console.error(error);
                    }
                    else{
                        print('Created folder: ' + dest);
                    }
                    writeFavicons(config, dest, function (error, favicon) {
                        return callback(error, favicon);
                    });
                });
            },
            function (favicon, callback) {
                var codes = [];
                if (config.html) {
                    print('\nWriting metadata to HTML file(s)');
                    async.each(config.html, function (html, callback) {
                        writeHTML(html, favicon.favicon.html_code, function (error, code) {
                            codes.push(code);
                            return callback(error);
                        });
                    }, function (error) {
                        return callback(error, codes);
                    });
                } else {
                    print('\nNot writing HTML, just returning metadata');
                    return callback(favicon.favicon.html_code);
                }
            }
        ], function (error, codes) {
            return callback ? callback(error, codes) : null;
        });
    }

    // Return base64 encoded file
	function encodeBase64(file, callback) {
		fs.readFile(file, {
			encoding : null
		}, function (error, data) {
			print('Encoded to base64: ' + file);
			return callback(error, data.toString('base64'));
		});
	}
    
    // Return if string has prefix
	function starts_with(str, prefix) {
		return str.lastIndexOf(prefix, 0) === 0;
	}

	// Return if string is URL
	function is_url(str) {
		return starts_with(str, 'http://') || starts_with(str, 'https://') || starts_with(str, '//');
	}

	// Write metadata to HTML
	function writeHTML(file, html, callback) {
		var add = typeof html === 'string' ? [html] : html,
		remove = _tags.remove;
		fs.exists(file, function (exists) {
			if (exists) {
				print('HTML file exists: ' + file);
				add = add.concat(typeof _tags.add === 'string' ? [_tags.add] : _tags.add);
				remove = remove.concat(typeof _tags.remove === 'string' ? [_tags.remove] : _tags.remove);
				metaparser({
					source : file,
					add : add,
					remove : remove,
					out : file,
					callback : function (error, html) {
						print('Successfully injected HTML into ' + file);
						return callback(error, html);
					}
				});
			} else {
				print('HTML file does not exist: ' + file);
				fs.writeFile(file, html, function (error) {
					print('Successfully created HTML file: ' + file);
					return callback(error, html);
				});
			}
		});
	}

    // Set custom icon sources if necessary
	function setIcons(config, source, callback) {
		if (typeof source === 'string') {
			if (is_url(source)) {
				print('Favicons source is a URL');
				config.data.favicon_generation.master_picture.type = 'url';
				config.data.favicon_generation.master_picture.url = source;
				return callback(null);
			}
			print('Favicons source is an inline string');
			encodeBase64(source, function (error, file) {
				config.data.favicon_generation.master_picture.content = file;
				return callback(error);
			});
		} else {
			print('Favicons source is an object');
			async.parallel([
					function (callback) {
						encodeBase64(source.android, function (error, file) {
							config.data.favicon_generation.favicon_design.android_chrome.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.appleIcon, function (error, file) {
							config.data.favicon_generation.favicon_design.ios.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.appleStartup, function (error, file) {
							config.data.favicon_generation.favicon_design.ios.startup_image.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.coast, function (error, file) {
							config.data.favicon_generation.favicon_design.coast.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.favicons, function (error, file) {
							config.data.favicon_generation.favicon_design.desktop_browser.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.firefox, function (error, file) {
							config.data.favicon_generation.favicon_design.firefox_app.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.opengraph, function (error, file) {
							config.data.favicon_generation.favicon_design.open_graph.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.windows, function (error, file) {
							config.data.favicon_generation.favicon_design.coast.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					},
					function (callback) {
						encodeBase64(source.yandex, function (error, file) {
							config.data.favicon_generation.favicon_design.yandex_browser.master_picture = {
								type : 'inline',
								content : file
							};
							return callback(error, file);
						});
					}
				], function (error, files) {
				if (files.length > 0) {
					config.data.favicon_generation.master_picture.content = files[0];
					return callback(error);
				}
				return callback('You must specify at least one icon!');
			});
		}
	}

	// Initializes the config object
	function getConfig(params) {
		var options = mergeDefaults(params || {}, _defaults),
			config = _config,
			icons_path;
		// Print development log
		print = function (message) {
			if (options.settings.logging && message) {
				console.log(message + '...');
			}
		};
		config.files = options.files;
		config.html = typeof options.files.html === 'string' ? [options.files.html] : options.files.html;
		if (options.files) {
			icons_path = options.files.iconsPath;
			if (options.files.html && options.files.dest) {
				icons_path = icons_path || path.relative(path.dirname(options.files.html), options.files.dest);
			}
			if (icons_path) {
				config.data.favicon_generation.files_location.type = 'path';
				config.data.favicon_generation.files_location.path = icons_path;
			}
		}
		if (options.icons.appleStartup) {
			config.data.favicon_generation.favicon_design.ios.startup_image.background_color = options.settings.background;
		} else {
			delete config.data.favicon_generation.favicon_design.ios.startup_image;
		}
		if (options.icons.appleIcon) {
			config.data.favicon_generation.favicon_design.ios.background_color = options.settings.background;
		} else {
			delete config.data.favicon_generation.favicon_design.ios;
		}
		if (options.icons.windows) {
			config.data.favicon_generation.favicon_design.windows.background_color = options.settings.background;
			config.data.favicon_generation.favicon_design.windows.picture_aspect = options.settings.silhouette ? 'white_silhouette' : 'no_change';
		} else {
			delete config.data.favicon_generation.favicon_design.windows;
		}
		if (options.icons.firefox) {
			config.data.favicon_generation.favicon_design.firefox_app.background_color = options.settings.background;
			config.data.favicon_generation.favicon_design.firefox_app.manifest.app_name = options.settings.appName;
			config.data.favicon_generation.favicon_design.firefox_app.manifest.app_description = options.settings.appDescription;
			config.data.favicon_generation.favicon_design.firefox_app.manifest.developer_name = options.settings.developer;
			config.data.favicon_generation.favicon_design.firefox_app.manifest.developer_url = options.settings.developerURL;
		} else {
			delete config.data.favicon_generation.favicon_design.firefox_app;
		}
		if (options.icons.android) {
			config.data.favicon_generation.favicon_design.android_chrome.theme_color = options.settings.background;
			config.data.favicon_generation.favicon_design.android_chrome.manifest.name = options.settings.appName;
			config.data.favicon_generation.favicon_design.android_chrome.manifest.start_url = options.settings.index;
			config.data.favicon_generation.favicon_design.android_chrome.manifest.existing_manifest = options.files.androidManifest;
		} else {
			delete config.data.favicon_generation.favicon_design.android_chrome;
		}
		if (options.icons.coast) {
			config.data.favicon_generation.favicon_design.coast.background_color = options.settings.background;
		} else {
			delete config.data.favicon_generation.favicon_design.coast;
		}
		if (!options.icons.favicons) {
			delete config.data.favicon_generation.favicon_design.desktop_browser;
		}
		if (options.icons.opengraph) {
			config.data.favicon_generation.favicon_design.open_graph.background_color = options.settings.background;
		} else {
			delete config.data.favicon_generation.favicon_design.open_graph;
		}
		if (options.icons.yandex) {
			config.data.favicon_generation.favicon_design.yandex_browser.background_color = options.settings.background;
			config.data.favicon_generation.favicon_design.yandex_browser.manifest.version = options.settings.version;
		} else {
			delete config.data.favicon_generation.favicon_design.yandex_browser;
		}
		return config;
	}

	// Send favicon generation request to the RealFaviconGenerator
    // Publish request to the RealFaviconGenerator API, stream unzipped response
	function faviconGenerator(config, callback){
        var client = new Client(),
            parserStream = unzip.Parse(),
            ended = false,
        // monkeypatch
            old_emit = parserStream.emit;
        parserStream.emit = function () {
            if (arguments[0] == 'close' || arguments[0] == 'end') {
                if (!ended) {
                    ended = true;
                    old_emit.apply(parserStream, ['end']);
                }
            } else {
                old_emit.apply(parserStream, arguments);
            }
        };
        client.post("http://realfavicongenerator.net/api/favicon", config, function (data, response) {
            if (print) {
                print('Posted request to RealFaviconGenerator');
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                return callback(data, null);
            }
            callback(null, data);
            return http.get(data.favicon_generation_result.favicon.package_url, function (response) {
                if (print) {
                    print('Successfully fetched the favicons file');
                }
                response.pipe(parserStream);
            });
        });
        return parserStream;
	}

    // Push generated favicons into the created folder
    function writeFavicons(config, dest, callback){
        var writeStream = fstream.Writer(dest);
        faviconGenerator(config, function (error, data) {
            if (error) {
                return callback(error, null);
            }
            writeStream.on('close', function () {
                print('Closing the write stream');
                return callback(null, data.favicon_generation_result);
            });
        }).pipe(writeStream);
    }
})();