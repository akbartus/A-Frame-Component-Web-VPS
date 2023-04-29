var SDK_VERSION		= "1_18_0";
var url = new URL(document.currentScript.src);
var v = url.searchParams.get("v");

if (v != null) {
  SDK_VERSION = v;
}

const versionBaseUrls = {
  "1_18_0": window.location.protocol + "//" + window.location.host + "/",
  "1_17_1": window.location.protocol + "//" + window.location.host + "/",
  "1_17_0": window.location.protocol + "//" + window.location.host + "/",
  "1_15_0": window.location.protocol + "//" + window.location.host + "/1.15.0/",
  "1_14_1": window.location.protocol + "//" + window.location.host + "/"  
};

var BASE_URL			= "https://developers.immersal.com/";

const LOGIN         = "login";
const RESET_PASSWORD  = "password";
const RESET_TOKEN   = "token";
const DOWNLOAD_MAP  = "map";
const DOWNLOAD_SPARSE	= "sparse";
const DOWNLOAD_DENSE	= "dense";
const DOWNLOAD_TEXTURED	= "tex";
const PRIVACY_MAP		= "privacy";
const COPY_MAP			= "copy";
const DELETE_MAP		= "delete";
const ALIGN_MAPS		= "align";
const STITCH_MAPS		= "fuse";
const REGISTER_USER	= "register";
const LIST_JOBS 		= "list";
const LIST_GEOJOBS	= "geolist";
const ACCEPT_EULA		= "eula";
const DOWNLOAD_FILE	= "download";
const STATUS 			  = "status";
const COVERAGE			= "coverage";
const METADATA_GET	= "metadataget";
const METADATA_SET	= "metadataset";
const LOCALIZE      = "localize";
const CLEAR         = "clear";
const B2G           = "b2g";
const CONSTRUCT     = "construct";
const VERSION       = "version";
const DOWNLOAD_POSES= "getposes";
const UPLOAD        = "upload";

const jobTypes = {
  MAP: 0,
  STITCH: 1,
  ALIGNMENT: 2
}

const mapTypes = {
  SPARSE: 0,
  DENSE: 1,
  TEXTURED: 2
}

const privacyTypes = {
  PRIVATE: 0,
  PUBLIC: 1
}

const views = {
  PRIVATE: 0,
  PUBLIC_LOCATION: 1,
  PUBLIC_USER: 2
}