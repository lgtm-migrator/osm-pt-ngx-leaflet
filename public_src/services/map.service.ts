import { EventEmitter, Injectable } from "@angular/core";
import { Http } from "@angular/http";

import { ConfigService } from "./config.service";
import { LoadingService } from "./loading.service";
import { StorageService } from "./storage.service";

import { Map } from "leaflet";
import LatLng = L.LatLng;
import LatLngExpression = L.LatLngExpression;

import { IPtStop } from "../core/ptStop.interface";

const DEFAULT_ICON = L.icon({
    iconUrl: "",
    shadowAnchor: [22, 94],
    shadowSize: [24, 24],
    shadowUrl: ""
});
const HIGHLIGHT_FILL = {
    color: "#ffff00",
    opacity: 0.6,
    weight: 6
};
const HIGHLIGHT_STROKE = {
    color: "#FF0000",
    opacity: 0.6,
    weight: 12
};
const FROM_TO_LABEL = {
    color: "#ffaa00",
    opacity: 0.6,
};
const REL_BUS_STYLE = {
    color: "#0000FF",
    opacity: 0.3,
    weight: 6
};
const REL_TRAIN_STYLE = {
    color: "#000000",
    opacity: 0.3,
    weight: 6
};
const REL_TRAM_STYLE = {
    color: "#FF0000",
    opacity: 0.3,
    weight: 6
};
const OTHER_STYLE = {
    color: "#00FF00",
    opacity: 0.3,
    weight: 6
};

@Injectable()
export class MapService {
    public map: Map;
    public baseMaps: any;
    public previousCenter: [number, number] = [0.0, 0.0];
    public osmtogeojson: any = require("osmtogeojson");
    public bounds;
    public highlightStroke: any = undefined;
    public editingMode: boolean;
    // public popupBtnClick: EventEmitter<any> = new EventEmitter();
    public markerClick: EventEmitter<any> = new EventEmitter();
    public markerEdit: EventEmitter<object> = new EventEmitter();
    public highlightType: string = "Stops";
    public membersEditing: boolean;
    public markerMembershipToggleClick: EventEmitter<any> = new EventEmitter();
    public membersHighlightLayer: any = undefined;
    private ptLayer: any;
    private highlightFill: any = undefined;
    private highlight: any = undefined;
    private markerFrom: any = undefined;
    private markerTo: any = undefined;

    constructor(private http: Http, private storageService: StorageService,
                private configService: ConfigService, private loadingService: LoadingService) {

        this.baseMaps = {
            Empty: L.tileLayer("", {
                attribution: ""
            }),
            CartoDB_dark: L.tileLayer("http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
                attribution: `&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap
                    </a> &copy; <a href='https://cartodb.com/attributions'>CartoDB</a>`,
                maxNativeZoom: 19, maxZoom: 22
            }),
            CartoDB_light: L.tileLayer("http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
                attribution: `&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap
                    </a> &copy; <a href='https://cartodb.com/attributions'>CartoDB</a>`,
                maxNativeZoom: 19, maxZoom: 22
            }),
            Esri: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/" +
                    "World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
                attribution: `Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap,
                    iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan,
                    METI, Esri China (Hong Kong), and the GIS User Community`,
                maxNativeZoom: 19, maxZoom: 22
            }),
            Esri_imagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/" +
                    "World_Imagery/MapServer/tile/{z}/{y}/{x}", {
                attribution: `Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye,
                    Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community `,
                maxNativeZoom: 19, maxZoom: 22
            }),
            HERE_satelliteDay: L.tileLayer("http://{s}.{base}.maps.cit.api.here.com/maptile/2.1/{type}/{mapID}/satellite.day/{z}/{x}/{y}/{size}/{format}?app_id={app_id}&app_code={app_code}&lg={language}", {
                attribution: "Map &copy; 1987-2014 <a href='http://developer.here.com'>HERE</a>",
                subdomains: "1234",
                mapID: "newest",
                app_id: ConfigService.hereAppId,
                app_code: ConfigService.hereAppCode,
                base: "aerial",
                maxNativeZoom: 19,
                maxZoom: 20,
                type: "maptile",
                language: "eng",
                format: "png8",
                size: "256"
            }),
            HERE_hybridDay: L.tileLayer("http://{s}.{base}.maps.cit.api.here.com/maptile/2.1/{type}/{mapID}/hybrid.day/{z}/{x}/{y}/{size}/{format}?app_id={app_id}&app_code={app_code}&lg={language}", {
                attribution: "Map &copy; 1987-2014 <a href='http://developer.here.com'>HERE</a>",
                subdomains: "1234",
                mapID: "newest",
                app_id: ConfigService.hereAppId,
                app_code: ConfigService.hereAppCode,
                base: "aerial",
                maxNativeZoom: 19,
                maxZoom: 20,
                type: "maptile",
                language: "eng",
                format: "png8",
                size: "256",
            }),
            MapBox_imagery: L.tileLayer("http://{s}.tiles.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=" + ConfigService.mapboxToken, {
                attribution: `<a href='https://www.mapbox.com/about/maps/'>&copy; Mapbox</a>,
                <a href='http://www.openstreetmap.org/about/'>&copy; OpenStreetMap</a> and
                <a href='https://www.mapbox.com/map-feedback/#/-74.5/40/10'>Improve this map</a>`,
                maxNativeZoom: 20, maxZoom: 22,
            }),
            MapBox_streets: L.tileLayer("http://{s}.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/{z}/{x}/{y}.png?access_token=" + ConfigService.mapboxToken, {
                attribution: `<a href='https://www.mapbox.com/about/maps/'>&copy; Mapbox</a>,
                <a href='http://www.openstreetmap.org/about/'>&copy; OpenStreetMap</a> and
                <a href='https://www.mapbox.com/map-feedback/#/-74.5/40/10'>Improve this map</a>`,
                maxNativeZoom: 20, maxZoom: 22,
            }),
            OSM_hot: L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
                attribution: `&copy; <a href='https://www.openstreetmap.org/copyright'>
                OpenStreetMap</a>, Tiles courtesy of <a href='https://hot.openstreetmap.org/'
                target='_blank'>Humanitarian OpenStreetMap Team</a>`,
                maxNativeZoom: 19, maxZoom: 22
            }),
            OSM_standard: L.tileLayer("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: `&copy; <a href='https://www.openstreetmap.org/copyright'>
                OpenStreetMap</a>, Tiles courtesy of <a href='https://openstreetmap.org/'
                target='_blank'>OpenStreetMap Team</a>`,
                maxNativeZoom: 19, maxZoom: 22
            }),
            OSM_PT: L.tileLayer("http://www.openptmap.org/tiles/{z}/{x}/{y}.png", {
                attribution: `&copy; <a href='https://www.openstreetmap.org/copyright'>
                OpenStreetMap</a>, Tiles courtesy of <a href='https://openptmap.org/'
                target='_blank'>OpenStreetMap Team</a>`,
                maxNativeZoom: 19, maxZoom: 17
            }),
            OSM_transport: L.tileLayer("http://{s}.tile2.opencyclemap.org/" +
                "transport/{z}/{x}/{y}.png", {
                attribution: `&copy; <a href='https://www.openstreetmap.org/copyright'>
                OpenStreetMap</a>, Tiles courtesy of <a href='https://opencyclemap.org/'
                target='_blank'>OpenStreetMap Team</a>`,
                maxNativeZoom: 19, maxZoom: 22
            })
        };
    }

    /**
     * Disables events propagation on map buttons (dragging of map, etc.).
     * @param elementId
     */
    public disableMouseEvent(elementId: string): void {
        const element = document.getElementById(elementId) as HTMLElement;
        if (element) {
            L.DomEvent.disableClickPropagation(element);
            L.DomEvent.disableScrollPropagation(element);
        }
    }

    /**
     * Clears layer with downloaded data.
     */
    public clearLayer(): void {
        if (this.ptLayer) {
            this.map.removeLayer(this.ptLayer);
            delete this.ptLayer;
        }
    }

    /**
     * Renders GeoJson data on the map.
     * @param transformedGeojson
     */
    public renderTransformedGeojsonData(transformedGeojson: any): void {
        this.ptLayer = L.geoJSON(transformedGeojson, {
            filter: (feature) => {
                // filter away already rendered elements
                if (this.storageService.elementsRendered.has(feature.id)) {
                    return false;
                }
                if (this.configService.cfgFilterLines) {
                    return "public_transport" in feature.properties && feature.id[0] === "n";
                } else {
                    return true;
                }
            },
            onEachFeature: (feature, layer) => {
                // prevent rendering elements twice later
                this.storageService.elementsRendered.add(feature.id);
                this.enableDrag(feature, layer);
            },
            pointToLayer: (feature, latlng) => {
                return this.stylePoint(feature, latlng);
            },
            style: (feature) => {
                return this.styleFeature(feature);
            }
        });
        console.log("LOG (map s.) Adding PTlayer to map again", this.ptLayer);
        this.ptLayer.addTo(this.map);
    }

    /**
     * Creates click events for leaflet elements.
     * @param feature
     * @param layer
     */
    public enableDrag(feature: any, layer: any): any {
        layer.on("click", (e) => {
            if (!this.membersEditing) {
            this.handleMarkerClick(feature);
            }
        });
        layer.on("click", (e) => {
            if (this.membersEditing) {
                this.handleMembershipToggle(feature);
            } else if (this.editingMode) {
                const marker = e.target;
                if (!marker.dragging._draggable) {
                    marker.dragging.enable();
                    // domUtil.addClass(marker._icon, "draggable");
                    // marker.setZIndexOffset(1000);
                    // domUtil.create("div", "handledrag", marker._icon);
                    // marker
                    //     .on("dragstart drag", function(e) {
                    //         e.target.closePopup();
                    //         domUtil.addClass(e.target._icon, "dragged");
                    //     })
                    //     .on("dragend", function(e) {
                    //         domUtil.removeClass(e.target._icon, "dragged");
                    //         // let newLoc = Climbo.funcs.latlngHuman( e.target.getLatLng(),"","",6);
                    //         // //$.post("savepos.php", { move: newLoc, id: marker.options.id });
                    //         // console.log("LOG (map s.) Save position", newLoc);
                    //     });
                } else {
                    // marker.dragging.disable();
                    // domUtil.removeClass(marker._icon, "draggable");
                    // marker.off("dragstart drag dragend");
                    // marker._icon.removeChild(marker._icon.getElementsByClassName("handledrag")[0]);
                }
            }
        });

        layer.on("dragend", (e) => {
            // console.log("LOG (map s.) Dragend event during editing mode", e);
            const marker = e.target;
            const featureTypeId = marker.feature.properties.id.split("/");
            const featureType = featureTypeId[0];
            const featureId = featureTypeId[1];
            const lat = marker.feature.geometry.coordinates[1];
            const lng = marker.feature.geometry.coordinates[0];
            const originalCoords: LatLng = new LatLng(lat, lng);
            const newCoords: LatLng = marker["_latlng"]; // .; getLatLng()
            const distance = originalCoords.distanceTo(newCoords);
            if (distance > 100) {
                marker.setLatLng(originalCoords).update();
                alert("Current node was dragged more than 100 meters away -> resetting position.");
                return;
            }
            // console.log("LOG (map s.) Distance is", distance, "meters", marker);
            const change = { from: { "lat": lat, "lng": lng },
                "to": { "lat": newCoords["lat"], "lng": newCoords["lng"] }
            };
            // console.log("LOG (map s.) Marker change is ", change);
            // TODO markers geometry editing and history undo/redo
            // this.markerEdit.emit({
            //     "featureId": featureId,
            //     "type": "change marker position",
            //     "change": change });
        });
    }

    /**
     *
     * @param requestBody
     * @param options
     */
    public renderData(requestBody: any, options: any): void {
        this.http.post("https://overpass-api.de/api/interpreter", requestBody, options)
            .map((res) => res.json())
            .subscribe((result) => {
                const transformed = this.osmtogeojson(result);
                this.ptLayer = L.geoJSON(transformed, {
                    onEachFeature: (feature, layer) => {
                        this.enableDrag(feature, layer);
                    },
                    pointToLayer: (feature, latlng) => {
                        return this.stylePoint(feature, latlng);
                    },
                    style: (feature) => {
                        return this.styleFeature(feature);
                    }
                });
                this.ptLayer.addTo(this.map);
                this.loadingService.hide();
            });
    }

    /**
     * Clears active map highlight (stop markers, route lines).
     */
    public clearHighlight(): void {
        if (this.markerFrom !== undefined) {
            this.map.removeLayer(this.markerFrom);
            this.markerFrom = undefined;
        }
        if (this.markerTo !== undefined) {
            this.map.removeLayer(this.markerTo);
            this.markerTo = undefined;
        }
        if (this.highlight !== undefined) {
            this.map.removeLayer(this.highlight);
            this.highlight = undefined;
        }
        if (this.highlightFill !== undefined) {
            this.map.removeLayer(this.highlightFill);
            this.highlightFill = undefined;
        }
        if (this.highlightStroke !== undefined) {
            this.map.removeLayer(this.highlightStroke);
            this.highlightStroke = undefined;
        }
    }

    /**
     * Returns coordinates for a stop specified by ID.
     * @param refId
     * @returns {{lat: number, lng: number}}
     */
    public findCoordinates(refId: number): LatLngExpression {
        const element = this.storageService.elementsMap.get(refId);
        return { lat: element.lat, lng: element.lon };
    }

    /**
     * Highlights stop marker with a circle.
     * @param stop
     */
    public showStop(stop: IPtStop): void {
        this.markerFrom = L.circleMarker( { lat: stop.lat, lng: stop.lon }, FROM_TO_LABEL);
        this.highlight = L.layerGroup([this.markerFrom]);
    }

    /**
     * Creates multiple relations highlights.
     * @param filteredRelationsForStop
     */
    public showRelatedRoutes(filteredRelationsForStop: object[]): void {
        if (filteredRelationsForStop) {
            this.storageService.stopsForRoute = [];
            for (const rel of filteredRelationsForStop) {
                this.showRoutes(rel);
            }
            if (this.highlight) {
                this.highlight.addTo(this.map);
            }
        }
    }

    /**
     * Builds multiple relations highlights.
     * @param rel
     * @returns {boolean}
     */
    public showRoutes(rel: any): boolean {
        const latlngs = Array();
        this.storageService.stopsForRoute = [];
        for (const member of rel.members) {
            if (member.type === "node" && ["stop", "stop_entry_only", "stop_exit_only"].indexOf(member.role) > -1) {
                this.storageService.stopsForRoute.push(member.ref);
                const latlng: LatLngExpression = this.findCoordinates(member.ref);
                if (latlng) {
                    latlngs.push(latlng);
                }
            }
        }
        if (latlngs.length > 0) {
            HIGHLIGHT_FILL.color = rel.tags.colour || rel.tags.color || "#" +
                (Math.floor(Math.random() * 0xffffff) | 0x0f0f0f).toString(16);
            this.highlightFill = L.polyline(latlngs, HIGHLIGHT_FILL).bindTooltip(rel.tags.name);
            if (this.highlight) {
                this.highlight.addLayer(L.layerGroup([this.highlightFill]));
            } else {
                this.highlight = L.layerGroup([this.highlightFill]);
            }
            this.drawTooltipFromTo(rel);
            return true;
        } else {
            return false;
        }
    }

    /**
     * Clears circles highlighting relation's current members.
     */
    public clearCircleHighlight(): void {
        if (this.membersHighlightLayer && this.map.hasLayer(this.membersHighlightLayer)) {
            console.log("LOG: delete existing highlight");
            this.map.removeLayer(this.membersHighlightLayer);
            this.membersHighlightLayer = undefined;
        }
    }

    /**
     * Builds and creates relation highlight.
     * @param rel
     * @returns {boolean}
     */
    public showRoute(rel: any): boolean {
        for (const member of rel.members) {
            if (member.type === "node" && ["stop", "stop_entry_only", "stop_exit_only"]
                    .indexOf(member.role) > -1) {
                this.storageService.stopsForRoute.push(member.ref);
            }
            else if (member.type === "node" && ["platform", "platform_entry_only", "platform_exit_only"]
                    .indexOf(member.role) > -1) {
                this.storageService.platformsForRoute.push(member.ref);
            }
            else if (member.type === "way") {
                this.storageService.waysForRoute.push(member.ref);
            }
            else if (member.type === "relation") {
                this.storageService.relationsForRoute.push(member.ref);
            }
        }

        let memberRefs;
        switch (this.highlightType) {
            case "Stops":
                memberRefs = this.storageService.stopsForRoute;
                break;
            case "Platforms":
                memberRefs = this.storageService.platformsForRoute;
                break;
        }

        const latlngs = Array();
        for (const ref of memberRefs ) {
            const latlng: LatLngExpression = this.findCoordinates(ref);
            if (latlng) {
                latlngs.push(latlng);
            }
        }

        // at least two nodes to form a polyline and not point
        if (latlngs.length > 1) {
            let currentHighlightFill = JSON.parse(JSON.stringify(HIGHLIGHT_FILL));
            currentHighlightFill.color = rel.tags.colour || rel.tags.color || HIGHLIGHT_FILL.color;
            this.highlightStroke = L.polyline(latlngs, HIGHLIGHT_STROKE).bindTooltip(rel.tags.name);
            this.highlightFill = L.polyline(latlngs, currentHighlightFill).bindTooltip(rel.tags.name);
            this.highlight = L.layerGroup([this.highlightStroke, this.highlightFill])
                .addTo(this.map);
            return true;
        } else {
            if (rel.members.length <= 1) {
                console.log("LOG (map s.) This is new relation -> do not highlight route");
            } else {
                alert("Problem occurred while drawing line (it has zero length - no added stops?)." +
                    "\n\n" + JSON.stringify(rel));
            }
            return false;
        }
    }

    /**
     * Verifies if highlight is still active.
     * @returns {any}
     */
    public highlightIsActive(): boolean {
        return this.highlightFill || this.highlightStroke || this.markerFrom || this.markerTo;
    }

    /**
     * Draws tooltip with name of from/to stops.
     * @param rel
     */
    public drawTooltipFromTo(rel: any): void {
        const latlngFrom: LatLngExpression = this.findCoordinates(
            this.storageService.stopsForRoute[0]); // get first and last ID reference
        const latlngTo: LatLngExpression = this.findCoordinates(
            this.storageService.stopsForRoute[this.storageService.stopsForRoute.length - 1]);

        const from = rel.tags.from || "#FROM";
        const to = rel.tags.to || "#TO";
        const route = rel.tags.route || "#ROUTE";
        const ref = rel.tags.ref || "#REF";

        this.markerTo = L.circleMarker( latlngTo, FROM_TO_LABEL)
            .bindTooltip("To: " + to + " (" + route + " " + ref + ")", {
                className: "from-to-label",
                offset: [0, 0],
                permanent: true
            });
        this.markerFrom = L.circleMarker( latlngFrom, FROM_TO_LABEL)
            .bindTooltip("From: " + from + " (" + route + " " + ref + ")", {
                className: "from-to-label",
                offset: [0, 0],
                permanent: true
            });
        if (this.highlight) {
            this.highlight.addLayer(L.layerGroup([this.markerFrom, this.markerTo]));
        } else {
            this.highlight = L.layerGroup([this.markerFrom, this.markerTo]);
        }
    }

    /**
     * Styles leaflet markers.
     * @param feature
     * @param latlng
     * @returns {any}
     */
    private stylePoint(feature: any, latlng: any): any {
        let iconUrl = "images/marker-icon.png";
        let shadowUrl = "";
        const fp = feature.properties;
        if ("public_transport" in fp ) { // && fp["railway"] === undefined
            if (fp["public_transport"] === "platform") {
                iconUrl = "images/transport/platform.png";
            } else if (fp["public_transport"] === "stop_position") {
                iconUrl = "images/transport/bus.png";
            } else if (fp["public_transport"] === "station") {
                iconUrl = "images/transport/station.png";
            }
        } else if ("highway" in fp) {
            if (fp["highway"] === "bus_stop") {
                iconUrl = "images/transport/bus.png";
            } else if (fp["highway"] === "traffic_signals") {
                iconUrl = "images/traffic/traffic_signals.png";
            } else if (fp["highway"] === "crossing") {
                iconUrl = "images/traffic/crossing.png";
            }
        } else if ("railway" in fp) {
            if (["crossing", "level_crossing", "railway_crossing"].indexOf(fp["railway"]) > -1) {
                iconUrl = "images/transport/railway/crossing.png";
            } else if (fp["railway"] === ["tram_stop"]) {
                iconUrl = "images/transport/railway/tram.png";
            } else if (fp["railway"] === "stop_position") {
                iconUrl = "images/transport/train.png";
            } else if (fp["public_transport"] === "station") {
                iconUrl = "images/transport/railway_station.png";
            }
        }
        if ("public_transport:version" in fp) {
            if (fp["public_transport:version"] === "1" ) {
                shadowUrl = "images/nr1-24x24.png";
            }
            if (fp["public_transport:version"] === "2" ) {
                iconUrl = "images/nr2-24x24.png";
            }
        }
        const myIcon = L.icon({
            iconAnchor: [7, 7],
            iconUrl,
            shadowAnchor: [22, 94],
            shadowSize: [24, 24],
            shadowUrl
        });
        return L.marker(latlng, {
            icon: myIcon,
            draggable: false,
            riseOnHover: true,
            title: fp.name || ""
        });
    }

    /**
     * Styles leaflet lines.
     * @param feature
     * @returns {{color: string, weight: number, opacity: number}}
     */
    private styleFeature(feature: any): object {
        switch (feature.properties.route) {
            case "bus":
                return REL_BUS_STYLE;
            case "train":
                return REL_TRAIN_STYLE;
            case "tram":
                return REL_TRAM_STYLE;
            default:
                return OTHER_STYLE;
        }
    }

    /**
     *
     * @param feature
     * @returns {number}
     */
    private getFeatureIdFromMarker(feature: any): number {
        const featureTypeId = feature.id.split("/");
        const featureType = featureTypeId[0];
        const featureId = Number(featureTypeId[1]);
        return featureId;
    }

    /**
     * Emits event when users clicks map marker.
     * @param feature
     */
    private handleMarkerClick(feature: any): void {
        const featureId: number = this.getFeatureIdFromMarker(feature);
        this.markerClick.emit(featureId);
        // explores leaflet element
        // this.popupBtnClick.emit([featureType, featureId]);
    }

    /**
     *
     * @param feature
     */
    private handleMembershipToggle(feature: any): void {
        const featureId: number = this.getFeatureIdFromMarker(feature);
        const marker: object = feature.target; // FIXME DELETE?
        this.markerMembershipToggleClick.emit({ featureId });
    }
}
