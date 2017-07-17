import {Injectable} from "@angular/core";
import {Subject} from "rxjs/Subject";

import {MapService} from "./map.service";
import {StorageService} from "./storage.service";
import {LoadingService} from "./loading.service";

import {OsmEntity} from "../core/osmEntity.interface";
import {IPtStop} from "../core/ptStop.interface";
import {IPtRelation} from "../core/ptRelation.interface";

@Injectable()
export class ProcessingService {
    // Observable boolean sources
    private showRelationsForStopSource = new Subject<boolean>();
    private showStopsForRouteSource = new Subject<boolean>();
    private refreshSidebarViewsSource = new Subject<string>();
    // Observable boolean streams
    public showRelationsForStop$ = this.showRelationsForStopSource.asObservable();
    public showStopsForRoute$ = this.showStopsForRouteSource.asObservable();
    public refreshSidebarViews$ = this.refreshSidebarViewsSource.asObservable();

    constructor(private storageService: StorageService,
                private mapService: MapService,
                private loadingService: LoadingService) {

        // this.mapService.popupBtnClick.subscribe(
        //     (data) => {
        //         let featureType = data[0];
        //         let featureId = Number(data[1]);
        //         let element = this.findElementById(featureId, featureType);
        //         if (!element) {
        //             alert("Element was not found?!");
        //         } else if (featureType === "node") {
        //             this.exploreStop(element);
        //         } else if (featureType === "relation") {
        //             this.exploreRelation(element);
        //         }
        //     }
        // );

        this.mapService.markerClick.subscribe(
            /**
             * @param data - string containing ID of clicked marker
             */
            (data) => {
                let featureId = Number(data);
                let element = this.findElementById(featureId);
                if (!element) alert("Clicked element was not found?!");
                console.log("LOG: Selected element is ", element);
                this.refreshTagView(element);
            }
        );
    }

    /**
     * Returns element with specific ID.
     * @param featureId
     * @param featureType
     * @returns {IPtStop}
     */
    public findElementById(featureId: number, featureType?: string): OsmEntity {
        return this.getElementById(featureId);
    }

    /**
     * Returns elemenet with specific ID directly from mapped object.
     * @param featureId
     */
    public getElementById(featureId: number): any {
        if (this.storageService.elementsMap.has(featureId)) {
            return this.storageService.elementsMap.get(featureId);
        }
    }

    /**
     * Filters data in the sidebar depending on current view's bounding box.
     */
    public filterDataInBounds(): void {
        if (!this.storageService.localJsonStorage) return;
        this.mapService.bounds = this.mapService.map.getBounds();
        for (let stop of this.storageService.listOfStops) {
            let el = document.getElementById(stop.id.toString());
            if (!el) return;
            if (el && this.mapService.bounds.contains([stop.lat, stop.lon])) {
                el.style.display = "table-row";
            } else {
                el.style.display = "none";
            }
        }
    }

    /**
     *
     * @param response
     */
    public processResponse(response: object): void {
        let transformedGeojson = this.mapService.osmtogeojson(response);
        this.storageService.localJsonStorage = response;
        this.storageService.localGeojsonStorage = transformedGeojson;
        this.createLists();
        this.mapService.renderTransformedGeojsonData(transformedGeojson);
        this.loadingService.hide();
    }

    public processMastersResponse(response: object) {
        response["elements"].forEach((element) => {
            if (!this.storageService.elementsMap.has(element.id)) {
                console.log("LOG: New element added:",
                    element.tags.public_transport === "route_master", element);
            }
            this.storageService.elementsMap.set(element.id, element);
            if (element.tags.public_transport === "route_master") {
                this.storageService.listOfMasters.push(element);
            } // do not add other relations because they should be already added
        });
        console.log("Total # of master rel. (route_master)", this.storageService.listOfMasters.length);
        this.storageService.logStats();

        let masterIds = [];
        this.storageService.listOfMasters.forEach( element => {
            for (let member of element["members"]) {
                masterIds.push(member["id"]);
                let element = this.storageService.elementsMap.get(member["id"]);
                element.hasMaster = true;
                this.storageService.elementsMap.set(member["id"], element);
            }
        });
        console.log("LOG: master IDs are:", masterIds);
    }

    /**
     * Creates initial list of stops/relations.
     */
    public createLists(): void {
        this.storageService.localJsonStorage.elements.forEach( (element) => {
            if (!this.storageService.idsSet.has(element.id)) {
                this.storageService.idsSet.add(element.id);
                this.storageService.elementsMap.set(element.id, element);

                switch (element.type) {
                    case "node":
                        if (element.tags && (element.tags.bus === "yes" || element.tags.public_transport)) {
                            this.storageService.listOfStops.push(element);
                        }
                        break;
                    case "relation":
                        if (element.tags.public_transport === "stop_area") {
                            this.storageService.listOfAreas.push(element);
                        } else {
                            this.storageService.listOfRelations.push(element);
                            break;
                        }
                }
            }
        });
        console.log(
            "Total # of nodes: ", this.storageService.listOfStops.length,
            "Total # of relations: ", this.storageService.listOfRelations.length,
            "Total # of master rel. (stop areas only): ", this.storageService.listOfAreas.length);
        this.storageService.logStats();
    }

    /**
     * Highlights downloaded stop areas by rectangles.
     */
    public drawStopAreas() {
        let boundaries = [];
        for (let area of this.storageService.listOfAreas) {
            let coords = [];
            for (let member of area["members"]) {
                if (member["type"] !== "node") continue;
                let ref: IPtStop = this.getElementById(member.ref);
                coords.push([ref.lat, ref.lon]);
            }
            let polyline = L.polyline(coords);
            L.rectangle(polyline.getBounds(), {color: "#000000", fill: false, weight: 2})
                .bindTooltip(area["tags"].name).addTo(this.mapService.map);
        }
    }

    /**
     *
     * @param data
     */
    public activateFilteredRouteView(data: boolean): void {
        this.showRelationsForStopSource.next(data);
    }

    /**
     *
     * @param data
     */
    public activateFilteredStopView(data: boolean): void  {
        this.showStopsForRouteSource.next(data);
    }

    /**
     *
     * @param data
     */
    public refreshSidebarView(data: string): void  {
        this.refreshSidebarViewsSource.next(data);
    }

    /**
     *
     * @param element
     */
    public refreshTagView(element: OsmEntity): void  {
        this.storageService.currentElementsChange.emit(JSON.parse(JSON.stringify(element)));
        this.refreshSidebarView("tag");
    }

    /**
     *
     * @param rel
     */
    public refreshRelationView(rel: IPtRelation) {
        this.storageService.listOfVariants = [];
        for (let member of rel.members) {
            let routeVariant = this.findElementById(member.ref);
            this.storageService.listOfVariants.push(routeVariant);
        }
        this.refreshSidebarView("relation");
    }

    /**
     *
     * @param rel
     */
    public exploreRelation(rel: any): void  {
        if (this.mapService.highlightIsActive()) this.mapService.clearHighlight();
        this.storageService.clearRouteData();
        if (this.mapService.showRoute(rel)) {
            this.mapService.drawTooltipFromTo(rel);
            this.filterStopsByRelation(rel);
            this.refreshTagView(rel);
            this.mapService.map.fitBounds(this.mapService.highlightStroke.getBounds());
        }
        this.refreshTagView(rel);
    }

    /**
     *
     * @param rel
     */
    public exploreMaster(rel: any): void {
        let routeVariants: object[] = [];
        for (let member of rel.members) {
            routeVariants.push(this.findElementById(member.ref));
        }
        this.mapService.showRelatedRoutes(routeVariants);
        this.refreshTagView(rel);
        this.refreshRelationView(rel);
    }

    /**
     *
     * @param stop
     */
    public exploreStop(stop: any): void {
        if (this.mapService.highlightIsActive()) this.mapService.clearHighlight();
        this.mapService.showStop(stop);
        let filteredRelationsForStop = this.filterRelationsByStop(stop);
        this.mapService.showRelatedRoutes(filteredRelationsForStop);
        this.refreshTagView(stop);
        this.mapService.map.panTo([stop.lat, stop.lon]);
    }

    /**
     * Filters relations (routes) for given stop.
     * @param stop
     */
    public filterRelationsByStop(stop: IPtStop): object[] {
        this.storageService.listOfRelationsForStop = [];

        for (let relation of this.storageService.listOfRelations) {
            for (let member of relation["members"]) {
                if (member["ref"] === stop.id) {
                    this.storageService.listOfRelationsForStop.push(relation);
                }
            }
        }
        this.activateFilteredRouteView(true);
        this.refreshSidebarView("route");
        return this.storageService.listOfRelationsForStop;
    }

    /**
     * Filters stops for given relation (route).
     * @param rel
     */
    public filterStopsByRelation(rel: IPtRelation): void {
        rel.members.forEach((mem) => {
            let stop = this.getElementById(mem.ref);
            let stopWithMemberAttr = Object.assign(mem, stop);
            this.storageService.listOfStopsForRoute.push(stopWithMemberAttr);
        });
        this.activateFilteredStopView(true);
        this.refreshSidebarView("stop");
    }

    /**
     * Zooms to the input element (point position or relation geometry).
     * @param element
     */
    public zoomToElement(element: OsmEntity): void {
        if (element.type === "node" ) {
            this.mapService.map.panTo([element["lat"], element["lon"]]);
        } else {
            let coords = [];
            for (let member of element["members"]) {
                if (member.type === "node") {
                    let element = this.findElementById(member.ref);
                    coords.push([element["lat"], element["lon"]]);
                }
            }
            let polyline = L.polyline(coords);
            this.mapService.map.fitBounds(polyline.getBounds());
            console.log("LOG: fitBounds to relation geometry");
        }
    }
}
