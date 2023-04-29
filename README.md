# A-Frame-Component-Web-VPS
<img alt="Screenshot" src="img/screenshot_1.jpg" width="600">

### **Description / Rationale**
This is a A-Frame component which allows to do visual positioning. It is a simple wrapper for Immersal's REST API, written in Three.js. The component was developed and adapted based on instructions give by Takeshi Kada on using Immersal Viewer <a href="https://zenn.dev/tkada/articles/1b144d1a427148">in local environment</a>.  

### **Instructions**

In order to use the component one should: 
1. Create a free acount on <a href="https://developers.immersal.com/"> Immersal's developer page</a>.
2. Create a map using Immersal Mapper App (available on AppStore and PlayStore; it is free).
3. Inside of Immersal's developer page take individual token and map id.
3. Then use the pre
The component has the following attributes: 

* modelURL: { type: "string" },
* scale: { type: "vec3", default: { x: 0.5, y: 0.5, z: 0.5 } }, // scale
* position: { type: "vec3", default: { x: 0, y: 0, z: 0 } }, // position
* rotation: { type: "vec3", default: { x: 0, y: 0, z: 0 } }, // rotation in degrees
* token: { type: "string" }, // token property
* mapID: { type: "string" },
* mapType: { type: "int", default: 0, oneOf: [0, 1] },
* pointCloudSize: { type: "int"} // 0 - sparse map, 1 - dense map


Example implementation is given below:
```
<html>
<head>
  <script src='https://aframe.io/releases/1.3.0/aframe.min.js'></script>
  <script src='js/image-particles-component.js'></script>
</head>
<body>
  <a-scene>
    <a-entity camera position="0 0 300" wasd-controls look-controls></a-entity>
    <a-entity
      image-particles="src: img/logo.png; particleSize: 5; particleCount: 4100; particleSpeed: 0.5; particleMotionDuration: 5"></a-entity>
    </a-scene>
</body>
</html>
```


### **Tech Stack**
The project is powered by AFrame and Three.js. 

### **Demo**
See demo of the component here: [Demo](https://img-particles.glitch.me/)
