// ==UserScript==
// @name         work.ink bypass
// @namespace    http://tampermonkey.net/
// @version      2025-08-19.7
// @description  bypasses work.ink shortened links
// @author       IHaxU
// @match        https://work.ink/*
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=work.ink
// @downloadURL  https://github.com/IHaxU/work.ink-bypass/raw/refs/heads/main/work.ink-bypass.user.js
// @updateURL    https://github.com/IHaxU/work.ink-bypass/raw/refs/heads/main/work.ink-bypass.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Global state
    let encryptionTokenOne = undefined;
    let encryptionTokenTwo = undefined;
    let linkInfo = undefined;

    // Encryption/Decryption utilities
    function encrypt(v, key) {
        let S = "";
        const R = [...new TextEncoder().encode(key)];
        let W = Date.now() % 256;
        S += W.toString(16).padStart(2, "0");

        for (let _ = 0; _ < v.length; _++) {
            const y = v.charCodeAt(_);
            const L = R[(_ * 2 + W) % R.length];
            const J = ((y ^ L) + _ % 8) % 256;
            S += J.toString(16).padStart(2, "0");
            W = (W * 19 + 29) % 256;
        }

        return S;
    }

    function decrypt(n, key) {
        let o = "";
        const c = [...new TextEncoder().encode(key)];
        const f = n.substring(0, 2);
        let v = parseInt(f, 16);
        const x = n.substring(2).match(/.{1,2}/g) || [];

        for (let y = 0; y < x.length; y++) {
            const L = parseInt(x[y], 16);
            const J = c[(y * 2 + v) % c.length];
            const re = (L - y % 8 + 256) % 256;
            const ie = String.fromCharCode(re ^ J);
            o += ie;
            v = (v * 19 + 29) % 256;
        }

        return o;
    }

    function encryptMessage(type, payload) {
        if (!encryptionTokenOne || !encryptionTokenTwo) {
            // console.error("Encryption tokens are not set. Cannot encrypt message.");
            return null;
        }
        return encrypt(JSON.stringify({
            type,
            payload: encrypt(JSON.stringify(payload), encryptionTokenTwo)
        }), encryptionTokenOne);
    }

    function decryptMessage(msg) {
        if (!encryptionTokenOne || !encryptionTokenTwo) {
            // console.error("Encryption tokens are not set. Cannot decrypt message.");
            return null;
        }
        const messageBody = JSON.parse(decrypt(msg, encryptionTokenOne));
        messageBody.payload = JSON.parse(decrypt(messageBody.payload, encryptionTokenTwo));
        return messageBody;
    }

    // Constants
    function getClientPacketTypes() {
        return {
            ANNOUNCE: "c_announce",
            MONETIZATION: "c_monetization",
            SOCIAL_STARTED: "c_social_started",
            RECAPTCHA_RESPONSE: "c_recaptcha_response",
            HCAPTCHA_RESPONSE: "c_hcaptcha_response",
            TURNSTILE_RESPONSE: "c_turnstile_response",
            ADBLOCKER_DETECTED: "c_adblocker_detected",
            FOCUS_LOST: "c_focus_lost",
            OFFERS_SKIPPED: "c_offers_skipped",
            FOCUS: "c_focus",
            WORKINK_PASS_AVAILABLE: "c_workink_pass_available",
            WORKINK_PASS_USE: "c_workink_pass_use",
            PING: "c_ping"
        };
    }

    function getServerPacketTypes() {
        return {
            ERROR: "s_error",
            LINK_INFO: "s_link_info",
            MONETIZATION: "s_monetization",
            SOCIAL_DONE: "s_social_done",
            SOCIAL_RUNNING: "s_social_running",
            LINK_DESTINATION: "s_link_destination",
            START_RECAPTCHA_CHECK: "s_start_recaptcha_check",
            START_HCAPTCHA_CHECK: "s_start_hcaptcha_check",
            START_TURNSTILE_CHECK: "s_start_turnstile_check",
            REDIRECTION_CANCELED: "s_redirection_canceled",
            RECAPTCHA_OKAY: "s_recaptcha_okay",
            HCAPTCHA_OKAY: "s_hcaptcha_okay",
            LINK_NOT_FOUND: "s_link_not_found",
            PROXY_DETECTED: "s_proxy_detected",
            WORKINK_PASS_LEFT: "s_workink_pass_left",
            PONG: "s_pong"
        };
    }

    // WebSocket handling
    function handleWebSocketMessage(event) {
        const serverPacketTypes = getServerPacketTypes();
        const msg = decryptMessage(event.data);

        if (!msg) {
            // console.error("Failed to decrypt message:", event.data);
            return;
        }

        // console.log("Received message:", msg);

        if (msg.type === serverPacketTypes.LINK_INFO) {
            linkInfo = msg.payload;
        } else if (msg.type === serverPacketTypes.LINK_DESTINATION) {
            window.location.href = msg.payload.url;
        }
    }

    function createWebSocketSendProxy(originalSend) {
        const clientPacketTypes = getClientPacketTypes();

        return function(...args) {
            const msg = decryptMessage(args[0]);

            if (!msg) {
                // console.error("Failed to decrypt message for sending:", args[0]);
                return originalSend.apply(this, args);
            }

            // console.log("Sent message:", msg);

            if (linkInfo && msg.type === clientPacketTypes.TURNSTILE_RESPONSE) {
                const ret = originalSend.apply(this, args);

                // Send bypass messages
                originalSend.call(this, encryptMessage(clientPacketTypes.MONETIZATION, {
                    type: "readArticles2",
                    payload: {
                        event: "read"
                    }
                }));

                originalSend.call(this, encryptMessage(clientPacketTypes.MONETIZATION, {
                    type: "betterdeals",
                    payload: {
                        event: "installed"
                    }
                }));

                return ret;
            }

            return originalSend.apply(this, args);
        };
    }

    function setupWebSocketProxy(webSocket) {
        if (!(webSocket instanceof WebSocket)) {
            // console.warn("Attempted to set 'websocket' with a non-WebSocket value:", webSocket);
            return;
        }

        // console.log("It's a WebSocket instance being set.");

        // Add message listener
        webSocket.addEventListener("message", handleWebSocketMessage);

        // Proxy the send method
        const originalSend = webSocket.send;
        webSocket.send = createWebSocketSendProxy(originalSend);
    }

    function createWebSocketPropertyProxy(value) {
        let _webSocketInstance = null;

        Object.defineProperty(value, 'websocket', {
            configurable: true,
            enumerable: true,

            get() {
                // console.log("Accessing 'websocket'. Current value:", _webSocketInstance);
                return _webSocketInstance;
            },

            set(newValue) {
                // console.log("Intercepted 'websocket' being set!");
                // console.log("Old value:", _webSocketInstance);
                // console.log("New value:", newValue);

                if (newValue instanceof WebSocket || newValue === null) {
                    _webSocketInstance = newValue;

                    if (newValue instanceof WebSocket) {
                        setupWebSocketProxy(newValue);
                    }
                } else {
                    // console.warn("Attempted to set 'websocket' with a non-WebSocket value:", newValue);
                    _webSocketInstance = newValue;
                }
            }
        });
    }

    function checkForEncryptionTokens(target, prop, value, receiver) {
        if (value &&
            typeof value === 'object' &&
            typeof value.encryptionTokenOne === 'string' &&
            typeof value.encryptionTokenTwo === 'string' &&
            value.encryptionTokenOne.length > 0 &&
            value.encryptionTokenTwo.length > 0 &&
            !encryptionTokenOne &&
            !encryptionTokenTwo
        ) {
            encryptionTokenOne = value.encryptionTokenOne;
            encryptionTokenTwo = value.encryptionTokenTwo;
            // console.log('[HACK] Intercepted encryption tokens:', encryptionTokenOne, encryptionTokenTwo);

            createWebSocketPropertyProxy(value);
        }

        return Reflect.set(target, prop, value, receiver);
    }

    function createComponentProxy(component) {
        return new Proxy(component, {
            construct(target, args) {
                const result = Reflect.construct(target, args);
                // console.log('[HACK] Intercepted SvelteKit component construction:', target, args, result);

                result.$$.ctx = new Proxy(result.$$.ctx, {
                    set: checkForEncryptionTokens
                });

                return result;
            }
        });
    }

    function createNodeResultProxy(result) {
        return new Proxy(result, {
            get(target, prop, receiver) {
                if (prop === 'component') {
                    return createComponentProxy(target.component);
                }
                return Reflect.get(target, prop, receiver);
            }
        });
    }

    function createNodeProxy(oldNode) {
        return async (...args) => {
            const result = await oldNode(...args);
            // console.log('[HACK] Intercepted SvelteKit node result:', result);
            return createNodeResultProxy(result);
        };
    }

    function createKitProxy(kit) {
      	if (typeof kit !== "object" || !kit) return [false, kit];
      
        const originalStart = "start" in kit && kit.start;
        if (!originalStart) return [false, kit];

        const kitProxy = new Proxy(kit, {
            get(target, prop, receiver) {
                if (prop === 'start') {
                    return function(...args) {
                        const appModule = args[0];
                        const options = args[2];

                        if (typeof appModule === 'object' &&
                            typeof appModule.nodes === 'object' &&
                            typeof options === 'object' &&
                            typeof options.node_ids === 'object') {

                            const oldNode = appModule.nodes[options.node_ids[1]];
                            appModule.nodes[options.node_ids[1]] = createNodeProxy(oldNode);
                        }

                        // console.log('[HACK] kit.start intercepted!', options);
                        return originalStart.apply(this, args);
                    };
                }
                return Reflect.get(target, prop, receiver);
            }
        });

        return [true, kitProxy];
    }

    function setupSvelteKitInterception() {
        const originalPromiseAll = Promise.all;
        let intercepted = false;

        Promise.all = async function(promises) {
            const result = originalPromiseAll.call(this, promises);

            if (!intercepted) {
                intercepted = true;

                return await new Promise((resolve) => {
                    result.then(([kit, app, ...args]) => {
                        // console.log('[HACK] SvelteKit modules loaded');

                        const [success, wrappedKit] = createKitProxy(kit);
                        if (success) {
                            // Restore original Promise.all
                            Promise.all = originalPromiseAll;

                            // console.log('[HACK] Wrapped kit ready:', wrappedKit, app);
                        }

                        resolve([wrappedKit, app, ...args]);
                    });
                });
            }

            return await result;
        };
    }

    // Initialize the bypass
    setupSvelteKitInterception();
})();
