import { EventEmitter, Injectable } from '@angular/core';

import { MapService } from './map.service';
import { StorageService } from './storage.service';
import { BsModalService } from 'ngx-bootstrap';
import { ProcessService } from './process.service';

import * as L from 'leaflet';
import { IPtRelation } from '../core/ptRelation.interface';

@Injectable()
export class RouteMasterWizardService {
  public map;
  public routes              = [];
  public ptLayerModal;
  public osmtogeojson: any   = require('osmtogeojson');
  public modalMapElementsMap = new Map();

  public autoRouteMapNodeClick: EventEmitter<number>                    = new EventEmitter();
  public newRoutesMapReceived: EventEmitter<Map<string, IPtRelation[]>> = new EventEmitter();

  public savedMultipleNodeDataResponses = [];
  public savedContinuousQueryResponses  = [];
  public savedMasterQueryResponses      = [];

  public elementsRenderedModalMap = new Set();
  public nodesFullyDownloaded     = new Set();

  // public routesMap: Map<string, any[]>                   = new Map();
  public relsMap                                         = new Map();
  public newRMsMap                                       = new Map();

  constructor(private storageSrv: StorageService,
              private mapSrv: MapService,
              private modalService: BsModalService,
              private processSrv: ProcessService) {
    this.modalService.onShown.subscribe(() => {
      this.onShownModal();
    });
    this.modalService.onHidden.subscribe(() => {
      this.processAllDownloadedOnMainMap();
      this.storageSrv.currentElement = null;
      this.storageSrv.currentElementsChange.emit(
        JSON.parse(JSON.stringify(null)),
      );
      this.storageSrv.stopsForRoute     = [];
      this.storageSrv.platformsForRoute = [];
      this.mapSrv.highlightType         = 'Stops';
    });
  }

  /***
   * Fired when modal has rendered
   * @returns {void}
   */
  public onShownModal(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  /***
   * Renders data on modal map which was already present on the main map
   * @returns {void}
   */
  public renderAlreadyDownloadedData(): void {
    let obj: any = {};
    let elements = [];
    this.storageSrv.elementsMap.forEach((element) => {
      elements.push(element);
    });
    obj.elements    = elements;
    let transformed = this.osmtogeojson(obj);
    this.renderTransformedGeojsonDataRMWizard(transformed, this.map);
  }

  /***
   *Used when modal is closed,
   *  all data downloaded for modal map is processed for main application
   * @returns {void}
   */
  public processAllDownloadedOnMainMap(): void {
    for (let res of this.savedContinuousQueryResponses) {
      this.processSrv.processResponse(res);
    }
    for (let res of this.savedMultipleNodeDataResponses) {
      this.processSrv.processNodeResponse(res);
    }
    for (let res of this.savedMasterQueryResponses) {
      this.processSrv.processMastersResponse(res);
    }
  }

  /**
   * Renders data on modal map
   * @param transformedGeoJSON
   * @param {Map} map
   */
  public renderTransformedGeojsonDataRMWizard(transformedGeoJSON: any, map: L.Map): void {
    this.ptLayerModal = L.geoJSON(transformedGeoJSON, {
      filter       : (feature) => {
        if (!this.elementsRenderedModalMap.has(feature.id) &&
          'public_transport' in feature.properties && feature.id[0] === 'n'
        ) {
          return true;
        } else {
          return false;
        }
      },
      onEachFeature: (feature, layer) => {
        this.elementsRenderedModalMap.add(feature.id);
        this.enableClickForRouteMasterWizardMap(feature, layer);
      },
      pointToLayer : (feature, latlng) => {
        return this.mapSrv.stylePoint(feature, latlng);
      },
    });
    console.log('LOG (route master wizard s.) Adding PT layer to modal map again', this.ptLayerModal);
    this.ptLayerModal.addTo(map);
  }

  /***
   * Enables click of nodes for modal map
   * @param feature
   * @param layer
   * @returns {void}
   */
  public enableClickForRouteMasterWizardMap(feature: any, layer: any): void {
    layer.on('click', () => {
      this.handleRouteMasterWizardMarkerClick(feature);
    });
  }

  /***
   * Handles map click
   * @param feature
   * @returns {void}
   */
  private handleRouteMasterWizardMarkerClick(feature: any): void {
    const featureId: number = this.mapSrv.getFeatureIdFromMarker(feature);
    this.autoRouteMapNodeClick.emit(featureId);
  }

  public findToBeComparedRels(response: any): any {
    let newDownloadedRoutes = [];
    let oldDownloadedRoutes = [];
    if (response) {
      for (let element of response['elements']) {
        if ((element.type === 'relation')
          && !(element.tags.public_transport === 'stop_area'
            && element.tags.public_transport === 'ref')
          && (element.members)) {
          newDownloadedRoutes.push(element);
        }
      }
    }
    this.modalMapElementsMap.forEach((element) => {
      if ((element.type === 'relation')
        && !(element.tags.public_transport === 'stop_area')
        && element.tags.ref
        && (element.members)
        && this.checkMembersInBounds(element)) {
        oldDownloadedRoutes.push(element);
      }
    });
    console.log('LOG (route master wizard s.) Newly downloaded relations',
      newDownloadedRoutes, 'old already present relations', oldDownloadedRoutes);

    let rels      = newDownloadedRoutes.concat(oldDownloadedRoutes);
    let relsMap   = new Map();
    let refOfRels = [];
    rels.forEach((rel) => {
      let noOfMembers     = rel['members'].length;
      let fullyDownloaded = 0;
      for (let member of rel['members']) {
        let memberEle = this.modalMapElementsMap.get(member.ref);
        if (this.modalMapElementsMap.has(member.ref) && memberEle.type === 'node') {
          let element = this.modalMapElementsMap.get(member.ref);
          refOfRels.push(rel.tags.ref);
          if (this.nodesFullyDownloaded.has(element.id)) {
            fullyDownloaded++;
          }
        }
      }
      let percentCoverage = (fullyDownloaded / noOfMembers) * 100;
      relsMap.set(rel.id, percentCoverage);
    });
    console.log('LOG (route master wizard s.) refs of routes relations to be compared:', refOfRels);
    this.relsMap = relsMap;
    return relsMap;
  }

  public checkMembersInBounds(relation: any): boolean {
    let flag = false;
    relation['members'].forEach((member) => {
      if (this.modalMapElementsMap.has(member.ref) && this.modalMapElementsMap.get(member.ref).type === 'node') {
        let element = this.modalMapElementsMap.get(member.ref);
        let latlng  = { lat: element.lat, lng: element.lon };
        if (this.map.getBounds().contains(latlng)) {
          flag = true;
        }
      }
    });
    return flag;
  }

  public findMissingRouteMasters(res: any): any {
    this.newRMsMap       = new Map();
    let RMRefs: string[] = [];

    for (let element of res['elements']) {
      if (!this.modalMapElementsMap.has(element.id)) {
        this.modalMapElementsMap.set(element.id, element);
      }
    }
    this.modalMapElementsMap.forEach((element) => {
      if (element.tags.type === 'route_master' && element.tags.ref) {
        RMRefs.push(element.tags.ref);
      }
    });

    console.log('LOG (route master wizard s.) Refs of route masters to be compared:', RMRefs);

    this.relsMap.forEach((value, key) => {
      let rel = this.modalMapElementsMap.get(key);
      if (!RMRefs.includes(rel.tags.ref)) {
        if (this.newRMsMap.has(rel.tags.ref)) {
          let alreadyAddedRels = this.newRMsMap.get(rel.tags.ref);
          alreadyAddedRels.push({ id: rel.id, percentCoverage: value });
        } else {
          let rels = [];
          rels.push({ id: rel.id, percentCoverage: value });
          this.newRMsMap.set(rel.tags.ref, rels);
        }
      }
    });

    let filteredMap = new Map();
    this.newRMsMap.forEach((value, key) => {
      if (value.length >= 2) {
        filteredMap.set(key, value);
      }
    });
    this.newRMsMap = filteredMap;
    console.log('LOG (route master wizard s.) Route masters for suggestions after ' +
      'filtering RM\'s withsingle route suggestions', this.newRMsMap);
    if (this.newRMsMap.size !== 0) {
      this.newRoutesMapReceived.emit(this.newRMsMap);
    } else {
      alert('Sorry, no suggestions found for the selected area.');
    }

    console.log('LOG (route master wizard s.) Route masters map for suggestions RM\'s', this.newRMsMap);
  }

  /***
   * View suggested route
   * @param routeID
   * @param connectObj
   * @returns {void}
   */
  public viewRoute(routeID: any, connectObj: any): void {
    let route = this.modalMapElementsMap.get(routeID);
    this.mapSrv.clearHighlight(this.map);
    this.storageSrv.stopsForRoute     = [];
    this.storageSrv.platformsForRoute = [];
    this.mapSrv.showRoute(route, this.map, this.modalMapElementsMap);
  }

}
