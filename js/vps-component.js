// Load PointCloud loader and ARButton for webXR (three.js)
import { PLYLoader } from "https://cdn.skypack.dev/pin/three@v0.131.3-QQa34rwf1xM5cawaQLl8/mode=imports,min/unoptimized/examples/jsm/loaders/PLYLoader.js";
import { ARButton } from "https://cdn.skypack.dev/pin/three@v0.131.3-QQa34rwf1xM5cawaQLl8/mode=imports,min/unoptimized/examples/jsm/webxr/ARButton.js";

// Create the worker code as a string
const workerCode = `
importScripts(
  'https://developers.immersal.com/js/UPNG.js',
  'https://developers.immersal.com/js/pako.min.js'
);

onmessage = function(msg) {
  const pixels = msg.data[0];
  const width = msg.data[1];
  const height = msg.data[2];
  const png = UPNG.encodeLL([pixels], width, height, 1, 0, 8, 0);
  postMessage(png);
}
`;

// Convert the worker code to a Blob object
const workerBlob = new Blob([workerCode], { type: "application/javascript" });

// Create a URL for the worker
const workerUrl = URL.createObjectURL(workerBlob);

// Define all variables
let container;
let overlay;
let locInfo;
let camera, scene, renderer;
let xrController;
let pointCloud;
let token = null;
let mapId;
let videoWidth = null;
let videoHeight = null;
let pixelBuffer = null;
let cameraIntrinsics = null;
let isLocalizing = false;
let encodedImage = null;
let trackerSpace = null;
let gl = null;
let readbackFramebuffer = null;
let readbackPixels = null;
let worker = null;
let locAttempt = 0;
let locSuccess = 0;

const poses = [];

const LARGE_MAP_THRESHOLD = 50.0;
// Define required shaders
const vertexShader = `
       uniform float size;
       attribute vec3 pointColor;
       varying vec3 vColor;
       void main() {
           vColor = pointColor;
           vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
           gl_PointSize = size * ( 300.0 / -mvPosition.z );
           gl_Position = projectionMatrix * mvPosition;
       }`;
const fragmentShader = `
       uniform vec3 color;
       uniform sampler2D pointTexture;
       uniform float alphaTest;
       varying vec3 vColor;
       void main() {
           gl_FragColor = vec4(color * vColor, 1.0);
           gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
           if (gl_FragColor.a < alphaTest) discard;
       }`;
const pointCloudMaterial = new THREE.ShaderMaterial({
  uniforms: {
    size: { value: 0.4 },
    color: { value: new THREE.Color(0xffffff) },
    pointTexture: { value: new THREE.TextureLoader().load("https://cdn.glitch.global/921711e4-380b-4dae-9617-77c8907c1e7d/circle.png") },
    alphaTest: { value: 0.1 },
  },
  vertexShader,
  fragmentShader,
});

// Virtual Positioning System for A-Frame
AFRAME.registerComponent("webvps", {
  schema: {
    modelURL: { type: "string" },
    scale: { type: "vec3", default: { x: 0.5, y: 0.5, z: 0.5 } }, // scale
    position: { type: "vec3", default: { x: 0, y: 0, z: 0 } }, // position
    rotation: { type: "vec3", default: { x: 0, y: 0, z: 0 } }, // rotation in degrees
    token: { type: "string" }, // token property
    mapID: { type: "string" },
    mapType: { type: "int", default: 0, oneOf: [0, 1] },
    pointCloudSize: { type: "int"} // 0 - sparse map, 1 - dense map
  },
  init: function () {
    var data = this.data;
    var el = this.el;
    let token = data.token;
    let myMapID = data.mapID;
    let myMapType = data.mapType;
    let myPointCloudSize = data.pointCloudSize;
    new THREE.GLTFLoader().load(data.modelURL, function (gltf) {
      var mesh = gltf.scene;
      mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
      mesh.position.set(data.position.x, data.position.y, data.position.z);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(data.rotation.x),
        THREE.MathUtils.degToRad(data.rotation.y),
        THREE.MathUtils.degToRad(data.rotation.z)
      );
      el.setObject3D("mesh", mesh);
    });

    init(token, myMapID, myMapType, myPointCloudSize); // start
    animate(); // comes after start
  },
});
// END 
let myModel = document.querySelector("[gltf-loader]"); // refer to a-frame entity

function init(tokenData, myMapID, myMapType, myPointCloudSize) {
  mapId = -1;
  let type = mapTypes.DENSE;
  let privacy = privacyTypes.PUBLIC;
  let s = `0&${myMapID}&${myMapType}`;
  console.log(s);

  if (s.length > 0) {
    s.split("&").forEach((item, index) => {
      console.log(item);
      switch (index) {
        case 0:
          privacy = parseInt(item);
          break;
        case 1:
          mapId = parseInt(item);
          break;
        case 2:
          type = parseInt(item);
          break;
      }
    });
  }

  if (privacy == privacyTypes.PRIVATE) {
    token = tokenData;
  }

  worker = new Worker(workerUrl);
  worker.onmessage = function (e) {
    encodedImage = e.data;
    localize();
  };

  container = document.getElementById("canvas-parent");
  overlay = document.getElementById("overlay");
  locInfo = document.getElementById("locinfo");

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.2,
    10000
  );
  camera.position.set(0.8, 0.6, -2.7);
  scene = document.querySelector("a-scene").object3D; // change this

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.addEventListener("sessionstart", function (event) {
    if (pointCloud) {
      pointCloud.material.size = 3;
    }
  });
  renderer.xr.addEventListener("sessionend", function (event) {
    if (pointCloud) {
      pointCloud.material.size = 1;
    }
  });
  container.appendChild(renderer.domElement);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ["camera-access", "dom-overlay"],
      domOverlay: { root: overlay },
    })
  );

  gl = renderer.getContext();
  readbackFramebuffer = gl.createFramebuffer();

  function onSelect() {
    const session = renderer.xr.getSession && renderer.xr.getSession();

    if (session) {
      let referenceSpace = renderer.xr.getReferenceSpace();
      let glLayer = session.renderState.baseLayer;

      session.requestAnimationFrame((time, xrFrame) => {
        let viewerPose = xrFrame.getViewerPose(referenceSpace);

        if (viewerPose) {
          for (const view of viewerPose.views) {
            if (view.camera) {
              let xrCamera = view.camera;
              let binding = new XRWebGLBinding(xrFrame.session, gl);
              let cameraTexture = binding.getCameraImage(xrCamera);
              let viewport =
                xrFrame.session.renderState.baseLayer.getViewport(view);

              videoWidth = xrCamera.width;
              videoHeight = xrCamera.height;

              let bytes = videoWidth * videoHeight * 4;

              if (bytes > 0) {
                if (!readbackPixels || readbackPixels.length != bytes) {
                  readbackPixels = new Uint8Array(bytes);
                }

                readbackPixels.fill(0);

                gl.bindTexture(gl.TEXTURE_2D, cameraTexture);
                gl.bindFramebuffer(gl.FRAMEBUFFER, readbackFramebuffer);
                gl.framebufferTexture2D(
                  gl.FRAMEBUFFER,
                  gl.COLOR_ATTACHMENT0,
                  gl.TEXTURE_2D,
                  cameraTexture,
                  0
                );

                if (
                  gl.checkFramebufferStatus(gl.FRAMEBUFFER) ==
                  gl.FRAMEBUFFER_COMPLETE
                ) {
                  gl.readPixels(
                    0,
                    0,
                    videoWidth,
                    videoHeight,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    readbackPixels
                  );
                  const e = gl.getError();
                  if (e != 0) {
                    console.warn("Got a GL error:", e);
                  } else {
                    let halfHeight = (videoHeight / 2) | 0;
                    let bytesPerRow = videoWidth * 4;

                    let temp = new Uint8Array(bytesPerRow);
                    for (let y = 0; y < halfHeight; ++y) {
                      let topOffset = y * bytesPerRow;
                      let bottomOffset = (videoHeight - y - 1) * bytesPerRow;

                      temp.set(
                        readbackPixels.subarray(
                          topOffset,
                          topOffset + bytesPerRow
                        )
                      );
                      readbackPixels.copyWithin(
                        topOffset,
                        bottomOffset,
                        bottomOffset + bytesPerRow
                      );
                      readbackPixels.set(temp, bottomOffset);
                    }

                    if (!pixelBuffer || pixelBuffer.length != bytes / 4) {
                      pixelBuffer = new Uint8Array(bytes / 4);
                    }

                    pixelBuffer.fill(0);

                    let grayIndex = 0;
                    for (let i = 0; i < bytes; i += 4) {
                      pixelBuffer[grayIndex++] = readbackPixels[i + 1];
                    }

                    const cameraViewport = {
                      width: videoWidth,
                      height: videoHeight,
                      x: 0,
                      y: 0,
                    };

                    cameraIntrinsics = getCameraIntrinsics(
                      view.projectionMatrix,
                      cameraViewport
                    );

                    trackerSpace = new THREE.Matrix4();
                    trackerSpace.copy(camera.matrixWorld);

                    worker.postMessage([pixelBuffer, videoWidth, videoHeight]);
                  }
                } else {
                  console.warn("Framebuffer incomplete!");
                }

                gl.bindFramebuffer(
                  gl.FRAMEBUFFER,
                  xrFrame.session.renderState.baseLayer.framebuffer
                );
              }
            }
          }
        }
      });
    }
  }

  xrController = renderer.xr.getController(0);
  xrController.addEventListener("select", onSelect);
  scene.add(xrController);

  // resize

  window.addEventListener("resize", onWindowResize, false);

  if (mapId != -1) {
    if (type == mapTypes.SPARSE) {
      renderer.outputEncoding = THREE.LinearEncoding;
      renderer.toneMapping = THREE.NoToneMapping;
      loadSparse(mapId, token, myPointCloudSize);
    }
    if (type == mapTypes.DENSE) {
      renderer.outputEncoding = THREE.LinearEncoding;
      renderer.toneMapping = THREE.NoToneMapping;
      loadDense(mapId, token, myPointCloudSize);
    }
    loadPoses(mapId, token);
  }
}

function localize() {
  if (isLocalizing) return;
  isLocalizing = true;
  locAttempt++;

  const json = {
    token: token,
    fx: cameraIntrinsics.x,
    fy: cameraIntrinsics.y,
    ox: cameraIntrinsics.z,
    oy: cameraIntrinsics.w,
    param1: 0,
    param2: 12,
    param3: 0.0,
    param4: 2.0,
    mapIds: [{ id: mapId }],
  };
  const payload = new Blob([JSON.stringify(json), "\0", encodedImage]);
  fetch(BASE_URL + "localize", {
    method: "POST",
    body: payload,
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        console.warn("error:" + JSON.stringify(response.json()));
        isLocalizing = false;
      }
    })
    .then((data) => {
      if (data.success) {
        console.log(data);
        console.log("Relocalized successfully");
        locSuccess++;

        if (pointCloud) {
          let position = new THREE.Vector3();
          let rotation = new THREE.Quaternion();
          let scale = new THREE.Vector3();

          const cloudSpace = new THREE.Matrix4();
          cloudSpace.set(
            data.r00,
            -data.r01,
            -data.r02,
            data.px,
            data.r10,
            -data.r11,
            -data.r12,
            data.py,
            data.r20,
            -data.r21,
            -data.r22,
            data.pz,
            0,
            0,
            0,
            1
          );

          const m = new THREE.Matrix4().multiplyMatrices(
            trackerSpace,
            cloudSpace.invert()
          );

          m.decompose(position, rotation, scale);
          // Set cube to position

          pointCloud.position.set(position.x, position.y, position.z);
          pointCloud.quaternion.set(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w
          );
          pointCloud.scale.set(scale.x, scale.y, scale.z);

          // New position of myModel based on localization 
            if (locSuccess <= 10) {
            myModel.setAttribute("visible", true);
            myModel.setAttribute(
              "position",
              `${position.x} ${position.y} ${position.z - 2}`
            );
            myModel.setAttribute(
              "rotation",
              `${THREE.MathUtils.degToRad(
                rotation.x
              )}, ${THREE.MathUtils.degToRad(
                rotation.y
              )}, ${THREE.MathUtils.degToRad(rotation.z)}`
            );
            myModel.setAttribute("scale", `${scale.x}, ${scale.y}, ${scale.z}`);
          }
        }
      } else {
        myModel.setAttribute("visible", false);
        console.log("Failed to relocalize");
      }
      locInfo.innerText =
        "Successful localizations: " + locSuccess + "/" + locAttempt;
      isLocalizing = false;
    })
    .catch((error) => console.warn("error:" + error));
}

function loadPoses(mapId, token) {
  var json = { token: token, id: mapId };

  fetch(BASE_URL + DOWNLOAD_POSES, {
    method: "POST",
    body: JSON.stringify(json),
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        console.log("error:" + JSON.stringify(response.json().error));
      }
    })
    .then((data) => {
      const n = data.poses.length;
      for (let i = 0; i < n; i++) {
        const ax = new THREE.AxesHelper(0.5);
        const d = data.poses[i];

        let position = new THREE.Vector3();
        let rotation = new THREE.Quaternion();
        let scale = new THREE.Vector3();

        const m = new THREE.Matrix4();
        m.set(
          d.r00,
          d.r01,
          d.r02,
          d.px,
          d.r10,
          d.r11,
          d.r12,
          d.py,
          d.r20,
          d.r21,
          d.r22,
          d.pz,
          0,
          0,
          0,
          1
        );

        m.decompose(position, rotation, scale);
        ax.position.set(position.x, position.y, position.z);
        ax.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        ax.scale.set(scale.x, scale.y, scale.z);

        poses.push(ax); // check this
        // Add here something
      }
    })
    .catch((error) => console.log("error:" + error));
}

function loadSparse(mapId, token, myPointCloudSize) {
  let loader = new PLYLoader();
  let url = BASE_URL + DOWNLOAD_SPARSE;
  if (token != null) {
    url += "?token=" + token + "&id=" + mapId;
  } else {
    url += "?id=" + mapId;
  }
  loader.load(url, function (geometry) {
    const pc = new THREE.BufferGeometry();
    const pointCount = geometry.getAttribute("position").count;
    pc.setAttribute("position", geometry.getAttribute("position"));
    pc.setAttribute("pointColor", geometry.getAttribute("color"));

    pointCloud = new THREE.Points(pc, pointCloudMaterial);

    scene.add(pointCloud);
    console.log(pointCloud);

    const bbox = new THREE.Box3().setFromObject(pointCloud);
    let size = bbox.getSize(new THREE.Vector3()).length();
    let center = bbox.getCenter(new THREE.Vector3());
    
    pointCloudMaterial.uniforms.size.value = myPointCloudSize;

    if (size > LARGE_MAP_THRESHOLD) {
      size = LARGE_MAP_THRESHOLD;
      center = new THREE.Vector3();

      pointCloudMaterial.uniforms.size.value = myPointCloudSize;
    }
    camera.position.copy(center);
    camera.position.x += size / 2.0;
    camera.position.y += size / 5.0;
    camera.position.z += size / 2.0;
    camera.position.z = -camera.position.z;
    camera.lookAt(center);
  });
}

function loadDense(mapId, token, myPointCloudSize) {
  let loader = new PLYLoader();
  let url = BASE_URL + DOWNLOAD_DENSE;
  if (token != null) {
    url += "?token=" + token + "&id=" + mapId;
  } else {
    url += "?id=" + mapId;
  }

  loader.load(url, function (geometry) {
    let material, mesh;
    geometry.computeVertexNormals();
    geometry.computeFaceNormals();
    material = new THREE.PointsMaterial({
      color: 0x80ff00,
      vertexColors: THREE.VertexColors,
      size: 3,
      sizeAttenuation: false,
    });
    mesh = new THREE.Mesh(geometry, material);
    // Put smth here
    console.log("Load");

    const bbox = new THREE.Box3().setFromObject(mesh);
    let size = bbox.getSize(new THREE.Vector3()).length();
    let center = bbox.getCenter(new THREE.Vector3());
    pointCloudMaterial.uniforms.size.value = myPointCloudSize;

    if (size > LARGE_MAP_THRESHOLD) {
      size = LARGE_MAP_THRESHOLD;
      center = new THREE.Vector3();

      pointCloudMaterial.uniforms.size.value = myPointCloudSize;
    }
    camera.position.copy(center);
    camera.position.x += size / 2.0;
    camera.position.y += size / 5.0;
    camera.position.z += size / 2.0;

    camera.position.z = -camera.position.z;
    camera.lookAt(center);

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    pointCloud = mesh;
    scene.add(pointCloud);
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Get camera intrinsics
function getCameraIntrinsics(projectionMatrix, viewport) {
  const p = projectionMatrix;
  let u0 = ((1 - p[8]) * viewport.width) / 2 + viewport.x;
  let v0 = ((1 - p[9]) * viewport.height) / 2 + viewport.y;
  let ax = (viewport.width / 2) * p[0];
  let ay = (viewport.height / 2) * p[5];

  const intr = { x: ax, y: ay, z: u0, w: v0 };
  return intr;
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  renderer.render(scene, camera);
}
