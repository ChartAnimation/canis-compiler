import ChartSpec from './ChartSpec.js';
import FacetSpec from './FacetSpec.js';
import TimingSpec from './TimingSpec.js';
import Animation from "./AnimationSpec.js";
import { CanisUtil } from './util/Util.js';
import { globalVar } from './util/GlobalVar.js';
import 'babel-polyfill';
import GroupingSpec from './GroupingSpec.js';

class CanisSpec {
    constructor() {
        this.currentSpec = {};
        this.canisObj = {};
        this.chartSpecs;
        this.facet;
        this._animations;
        this.chartWidth;
        this.chartHeight;
        this.hasError = false;
    }

    set animations(aniJson) {
        let idxAniJson = aniJson.map(tmpAni => {
            tmpAni.chartIdx = 0
            return tmpAni;
        });
        let chartNum = 0;//number of charts
        if (this.facet) {
            chartNum = this.facet.views[0].frames.length;
        } else {
            chartNum = this.chartSpecs.length;
        }
        if (chartNum > 1) {//more than 1 input chart
            for (let i = 1; i < chartNum - 1; i++) {
                let tmpAniJson = CanisUtil.deepClone(aniJson);
                tmpAniJson[0].reference = TimingSpec.timingRef.previousEnd;
                let tmpIdxAniJson = tmpAniJson.map(tmpAni => {
                    tmpAni.chartIdx = i;
                    return tmpAni;
                })
                idxAniJson.push(...tmpIdxAniJson);
            }
        }
        this._animations = idxAniJson;
    }

    get animations() {
        return this._animations;
    }

    // static loadSpec(url, callback) {
    //     let xhr = new XMLHttpRequest(),
    //         okStatus = document.location.protocol === "file:" ? 0 : 200;
    //     xhr.open('GET', url, false);
    //     xhr.overrideMimeType("text/html;charset=utf-8");
    //     xhr.send(null);
    //     if (xhr.status === okStatus) {
    //         let spec = xhr.responseText;
    //         callback(JSON.parse(spec));
    //     } else if (xhr.status === 404) {
    //         console.log('can not find ' + url + ' ! Please check the url.');
    //     }
    // }

    preprocessCharts(spec, diffChart, status = null) {
        console.time('prepeocess charts');
        this.chartSpecs = [];
        let canisObj = spec;

        if (diffChart) {
            // console.log('using different chart, processing charts');
            [canisObj.charts, this.hasError] = ChartSpec.chartPreProcessing(canisObj.charts, status);
            if (this.hasError) return canisObj;
            //deal with input charts
            for (let i = 0; i < canisObj.charts.length; i++) {
                const chartName = typeof canisObj.charts[i].id === 'undefined' ? 'chart' + i : canisObj.charts[i].id;
                const chartType = typeof canisObj.charts[i].type === 'undefined' ? ChartSpec.CHART_URL : canisObj.charts[i].type;
                const tmpChart = new ChartSpec(chartName, chartType, canisObj.charts[i].source);
                this.chartSpecs.push(tmpChart);
            }
            //init facet
            if (canisObj.facet) {
                this.facet = new FacetSpec(canisObj.facet.type, canisObj.facet.views);
            }
            this.hasError = ChartSpec.loadCharts(this.chartSpecs, this.facet, status);
            if (this.hasError) return canisObj;

            //set viewport for jsmovin
            globalVar.jsMovin.setViewport(ChartSpec.viewport.chartWidth, ChartSpec.viewport.chartHeight);

            ChartSpec.removeTransAndMerge();
            document.getElementById('chartContainer').innerHTML = '';
            document.getElementById('chartContainer').appendChild(ChartSpec.svgChart);
        }
        globalVar.jsMovin.clearLayers();
        ChartSpec.addLottieMarkLayers(ChartSpec.svgChart);

        console.timeEnd('prepeocess charts');
        return canisObj;
    }

    compareSpec(spec) {
        let diffChart = false;
        console.log('comparing: ', this.currentSpec.charts, spec.charst);
        if ((typeof this.currentSpec.charts !== 'undefined' && JSON.stringify(spec.charts) !== JSON.stringify(this.currentSpec.charts)) ||
            typeof this.currentSpec.charts === 'undefined' ||
            (typeof spec.facet !== 'undefined' && typeof this.currentSpec.facet !== 'undefined' && JSON.stringify(spec.facet) !== JSON.stringify(this.currentSpec.facet)) ||
            ((typeof this.currentSpec.facet === 'undefined' || typeof spec.facet === 'undefined') && !(typeof this.currentSpec.facet === 'undefined' && typeof spec.facet === 'undefined'))
        ) {
            diffChart = true;
        }
        if (diffChart) {
            // console.log('charts are different');
            Animation.domMarks.clear();
            ChartSpec.dataMarkDatum.clear();
            ChartSpec.nonDataMarkDatum.clear();
            ChartSpec.chartUnderstanding = {};
            Animation.animations.clear();
        }
        this.currentSpec = spec;
        return diffChart;
    }

    /**
     * check the validaty of the spec
     * @param {*} spec 
     */
    checkSpec(spec, status) {
        let hasError = false;
        //check charts
        if (spec.charts.length === 0) {
            hasError = true;
            status.info = { type: 'error', msg: 'There are no input charts.' };
        }
        //check chart source
        for (let i = 0, len = spec.charts.length; i < len; i++) {
            if (!spec.charts[i].source) {
                hasError = true;
                status.info = { type: 'error', msg: 'No chart source found in chart item.' };
                break;
            } else {
                const sourceStr = spec.charts[i].source;
                if (sourceStr.indexOf('.dsvg') < 0 && !(spec.charts[i].start && spec.charts[i].end)) {
                    hasError = true;
                    status.info = { type: 'error', msg: 'No range specification found for input chart index .' };
                    break;
                }
            }
        }
        //check animation
        for (let i = 0, len = spec.animations.length; i < len; i++) {
            if (!spec.animations[i].selector) {
                hasError = true;
                status.info = { type: 'error', msg: 'No selector found in animation unit.' };
                break;
            } else if (!spec.animations[i].effects) {
                hasError = true;
                status.info = { type: 'error', msg: 'No effects found in animation unit.' };
                break;
            } else {
                //check reference
                if (spec.animations[i].reference) {
                    if (!Object.keys(TimingSpec.timingRef).includes(TimingSpec.transRef(spec.animations[i].reference))) {
                        hasError = true;
                        status.info = { type: 'error', msg: 'The value of the reference has to be one of: start with previous or start after previous.' };
                        break;
                    }
                }
                //check grouping
                if (spec.animations[i].grouping) {
                    hasError = this.checkGroupingSpec(spec.animations[i].grouping, status);
                    if (hasError) {
                        break;
                    }
                }
                //check effects
                for (let j = 0, len2 = spec.animations[i].effects.length; j < len2; j++) {
                    if (!spec.animations[i].effects[j].type) {
                        hasError = true;
                        status.info = { type: 'error', msg: 'No effect type found in effect item.' };
                        break;
                    }
                }
            }
        }
        return hasError;
    }

    checkGroupingSpec(groupingSpec, status) {
        if (groupingSpec.reference) {
            if (!Object.keys(TimingSpec.timingRef).includes(TimingSpec.transRef(groupingSpec.reference))) {
                status.info = { type: 'error', msg: 'The value of the reference has to be one of: start with previous or start after previous.' };
                return true;
            }
        }
        if (groupingSpec.grouping) {
            return this.checkGroupingSpec(groupingSpec.grouping, status);
        }
        return false;
    }

    async init(spec, status = null) {
        // console.log(spec);
        if (status) {
            this.hasError = this.checkSpec(spec, status);
        }

        if (!this.hasError) {
            Animation.resetAll();
            GroupingSpec.frames.clear();//clear keyframe record;
            GroupingSpec.framesMark.clear();//clear keyframe record;
            if (spec.charts.length === 0) {//no charts specified
                Animation.domMarks.clear();
                ChartSpec.dataMarkDatum.clear();
                ChartSpec.nonDataMarkDatum.clear();
                ChartSpec.chartUnderstanding = {};
                Animation.animations.clear();
                if (document.getElementById('chartContainer')) {
                    document.getElementById('chartContainer').innerHTML = '';
                }
            } else {
                //set framerate for jsmovin
                globalVar.jsMovin.setFrameRate(TimingSpec.FRAME_RATE);

                const diffChart = this.compareSpec(spec);
                // console.log('diff chart: ', diffChart);
                let canisObj = await this.preprocessCharts(spec, diffChart, status);

                //deal with animations
                this.animations = canisObj.animations;

                if (Array.isArray(this.animations)) {
                    let lastAnimation;
                    for (let aniIdx = 0; aniIdx < this.animations.length; aniIdx++) {
                        let animationJson = this.animations[aniIdx];
                        console.time('using dom');
                        //use the selector in animation to select marks and record dom attrs
                        console.time('query dom');
                        let tmpContainer = document.createElement('div');
                        document.body.appendChild(tmpContainer);
                        tmpContainer.innerHTML = ChartSpec.charts[animationJson.chartIdx].outerHTML;
                        let marks = tmpContainer.querySelectorAll(animationJson.selector);
                        console.timeEnd('query dom');

                        let usedChangedAttrs = [];
                        for (let i = 0; i < ChartSpec.changedAttrs.length; i++) {
                            usedChangedAttrs.push(ChartSpec.changedAttrs[i]);
                        }

                        //check whether the animation is existed
                        //TODO: remove non existed animations in the current spec
                        console.log('selector of this animation: ', animationJson.selector);
                        let animation;
                        if (typeof Animation.animations.get(animationJson.selector) !== 'undefined') {//already have this animation
                            animation = Animation.animations.get(animationJson.selector);
                            animation.translate(animationJson, usedChangedAttrs, true);
                        } else {
                            animation = new Animation();
                            animation.translate(animationJson, usedChangedAttrs);//translate from json obj to Animation obj
                            Animation.animations.set(animationJson.selector, animation);
                        }
                        console.log('translated animation: ', animation);

                        console.timeEnd('using dom');
                        let markIds = [];//record all ids of selected marks
                        if (marks.length > 0) {
                            console.time('extract mark dom');
                            [].forEach.call(marks, function (mark) {
                                if (mark.classList.contains('mark')) {
                                    let markId = mark.getAttribute('id');
                                    markIds.push(markId);
                                    if (typeof Animation.domMarks.get(markId) === 'undefined') {
                                        //process path
                                        if (mark.tagName === 'path') {//consider the linkage shape later
                                            let markJSON = CanisUtil.toJSON(mark);
                                            let transformedAttrs = CanisUtil.discretizePath(markJSON);

                                            if (transformedAttrs) {
                                                if (transformedAttrs.type === 'lines') {
                                                    for (let i = 0; i < transformedAttrs.data.length; i++) {
                                                        markJSON.attr['x' + (1 + 2 * i)] = transformedAttrs.data[i][0][0];
                                                        markJSON.attr['y' + (1 + 2 * i)] = transformedAttrs.data[i][0][1];
                                                        markJSON.attr['x' + (2 + 2 * i)] = transformedAttrs.data[i][1][0];
                                                        markJSON.attr['y' + (2 + 2 * i)] = transformedAttrs.data[i][1][1];
                                                    }
                                                } else {
                                                    let tfAttrsDataKeys = Object.keys(transformedAttrs.data);

                                                    for (let i = 0; i < tfAttrsDataKeys.length; i++) {
                                                        let tAttr = tfAttrsDataKeys[i];
                                                        if (tAttr === 'radius') {
                                                            if (transformedAttrs.data[tAttr].length > 1) {
                                                                markJSON.attr.innerRadius = transformedAttrs.data[tAttr][0].rx + 1;
                                                                markJSON.attr.outterRadius = transformedAttrs.data[tAttr][1].rx - 1;
                                                            } else {
                                                                markJSON.attr.innerRadius = 0;
                                                                markJSON.attr.outterRadius = transformedAttrs.data[tAttr][0].rx - 1;
                                                            }
                                                        } else {
                                                            markJSON.attr[tAttr] = transformedAttrs.data[tAttr];
                                                        }
                                                    }
                                                }
                                                // console.log(markJSON);
                                                mark = CanisUtil.toDOM(markJSON);
                                            }
                                        }

                                        let tmpDomAttrObj = {};
                                        let attrArr = [...mark.attributes];
                                        for (let i = 0; i < attrArr.length; i++) {
                                            let attrName = attrArr[i];
                                            tmpDomAttrObj[attrName.name] = mark.getAttribute(attrName.name);
                                        }
                                        let markDom = document.getElementById(markId);
                                        tmpDomAttrObj['bbWidth'] = markDom.getBBox().width;
                                        tmpDomAttrObj['bbHeight'] = markDom.getBBox().height;
                                        tmpDomAttrObj['bbX'] = markDom.getBBox().x;
                                        tmpDomAttrObj['bbY'] = markDom.getBBox().y;
                                        tmpDomAttrObj['content'] = mark.textContent;
                                        tmpDomAttrObj['id'] = markId;
                                        let dataDatumAttrValue = JSON.parse(mark.getAttribute('data-datum'));
                                        if (Array.isArray(dataDatumAttrValue)) {
                                            dataDatumAttrValue = dataDatumAttrValue[0];
                                        }
                                        tmpDomAttrObj['data-datum'] = dataDatumAttrValue;
                                        // CanisSpec.markData.set(markId, dataDatumAttrValue);
                                        tmpDomAttrObj['tagName'] = mark.tagName;
                                        if (mark.tagName === 'path' || mark.tagName === 'line') {
                                            tmpDomAttrObj['stroke-dasharray'] = document.getElementById(markId).getTotalLength();
                                            tmpDomAttrObj['stroke-dashoffset'] = document.getElementById(markId).getTotalLength();
                                            if (mark.tagName === 'path') {
                                                let discD = CanisUtil.discretizeD(mark.getAttribute('d'), '#000');
                                                if (typeof discD !== 'undefined' && discD) {
                                                    if (discD.type === 'pies') {
                                                        tmpDomAttrObj['cx'] = discD.data.cx;
                                                        tmpDomAttrObj['cy'] = discD.data.cy;
                                                        tmpDomAttrObj['startAngle'] = (discD.data.clockwise ? discD.data.startAngle : discD.data.endAngle) - 1 / (Math.PI * 2);
                                                        tmpDomAttrObj['endAngle'] = (!discD.data.clockwise ? discD.data.startAngle : discD.data.endAngle) + Math.PI * 4 + 1 / (Math.PI * 2);
                                                        if (discD.data.radius.length > 1) {
                                                            tmpDomAttrObj['innerRadius'] = discD.data.radius[0].rx > discD.data.radius[1].rx ? discD.data.radius[1].rx : discD.data.radius[0].rx;
                                                            tmpDomAttrObj['outterRadius'] = discD.data.radius[0].rx > discD.data.radius[1].rx ? discD.data.radius[0].rx : discD.data.radius[1].rx;
                                                            tmpDomAttrObj['outterRadius']++;
                                                        } else {
                                                            tmpDomAttrObj['innerRadius'] = 0;
                                                            tmpDomAttrObj['outterRadius'] = discD.data.radius[0].rx + 1;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Animation.domMarks.set(markId, tmpDomAttrObj);
                                    }

                                }
                            })
                            // console.log('after', Animation.domMarks);
                            console.timeEnd('extract mark dom');
                        }
                        animation.calAniTime(markIds, lastAnimation);
                        lastAnimation = animation;
                        document.body.removeChild(tmpContainer);
                    }
                }
            }
        }

    }

    render(callback, status = null) {
        console.time('rendering');
        Animation.renderAnimation(status);
        Animation.findKeyframes();
        //map animation keyframes to lottie spec
        Animation.mapToLottieSpec();

        //export lottie JSON
        let lottieJSON = globalVar.jsMovin.toJSON();
        CanisSpec.lottieJSON = lottieJSON;
        console.timeEnd('rendering');
        if (status) {
            status.info = 'Done rendering.';
        }
        callback();
        return JSON.parse(lottieJSON);
    }
}

CanisSpec.lottieJSON = '';

export default CanisSpec;