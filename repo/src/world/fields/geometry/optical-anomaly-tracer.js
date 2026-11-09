/**
 * Cross-slice optical transport through explicitly optically-enabled
 * slice-transition anomalies. This module is CPU-only and keeps all ray state
 * in authoritative ambient R4 / slice-local coordinates.
 *
 * A slice aperture is represented by a spherical capture boundary in that
 * slice. At entry, the aperture's metric-normal covector is transferred to
 * the anomaly's slice-normal covector. At exit the transfer is reversed.
 * Canonical momentum tangent to the aperture boundary is preserved and the
 * normal coefficient is solved from the Hamiltonian (frequency) constraint.
 */

import {
    add4,
    ambientToSlice,
    dot4,
    norm4,
    scale4,
    sliceToAmbient,
    subtract4
} from './spatial-4d.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import {
    createOpticalMetricField,
    blendScaledPositiveDefiniteMetrics3,
    geometricMeanMetricScale3
} from './optical-metric.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import {
    createOpticalRayState,
    evaluateOpticalHamiltonian,
    traceOpticalRay
} from './optical-ray-integrator.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import {
    createSliceOpticalField,
    traceOpticalRayInSlice
} from './optical-slice-tracer.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import {
    evaluateOpticalAnomalyCoupling
} from './optical-contracts.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import {
    containsAmbientPoint,
    SLICE_TRANSITION_ANOMALY
} from './spatial-anomaly.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';

const AXES4 = ['x', 'y', 'z', 'w'];
const EPSILON = 1e-8;
const DEFAULT_MAX_TRANSITIONS = 8;

/**
 * Builds a positive-definite four-dimensional optical field for one anomaly.
 * The tangential 3D metric smoothly blends from the source slice to the
 * destination slice along the common slice normal. W coupling reuses the
 * anomaly's radial smootherstep envelope but is independent of player stats.
 */
function createAnomalyOpticalField(anomaly, sourceBinding, destinationBinding, options = {}) {
    validateAnomaly(anomaly);
    validateBinding(sourceBinding, anomaly.source.sliceId, 'source');
    validateBinding(destinationBinding, anomaly.destination.sliceId, 'destination');

    const sourceFrame = sourceBinding.slice.frame;
    const destinationFrame = destinationBinding.slice.frame;
    const normalAlignment = Math.abs(dot4(sourceFrame.normal, destinationFrame.normal));
    if (normalAlignment < 1 - 1e-7) {
        throw new RangeError('Optical anomaly fields require parallel or anti-parallel slice normals.');
    }

    const sourceAmbient = sliceToAmbient(sourceFrame, anomaly.source.position);
    const destinationAmbient = sliceToAmbient(destinationFrame, anomaly.destination.position);
    const signedSpan = dot4(subtract4(destinationAmbient, sourceAmbient), sourceFrame.normal);
    if (Math.abs(signedSpan) <= EPSILON) {
        throw new RangeError('Optical anomaly endpoints must have non-zero separation along the slice normal.');
    }

    const sourceAxes = sourceFrame.axes;
    const destinationAxes = destinationFrame.axes;
    const sourceTransform = sourceBinding.spatialTransform;
    const destinationTransform = destinationBinding.spatialTransform;
    if (typeof sourceTransform?.metricAtWorld !== 'function' ||
        typeof destinationTransform?.metricAtWorld !== 'function') {
        throw new TypeError('Both optical anomaly endpoint bindings require SpatialTransform.metricAtWorld().');
    }

    const refractiveIndexAt = options.refractiveIndexAt ?? anomaly.optics.refractiveIndex;
    const gradientStep = options.gradientStep;
    const metricSampling = options.metricSampling ?? anomaly.optics.metricSampling ?? 'endpoint';
    if (!['endpoint', 'pointwise', 'ambient'].includes(metricSampling)) {
        throw new RangeError(`Unsupported anomaly metric sampling mode: ${metricSampling}`);
    }
    // A 4D bridge connects two different intrinsic 3D metrics. Their tangent
    // coordinates are not globally identified, so the default bridge uses
    // aperture metrics and interpolates them only along the bridge normal.
    // The entry-side endpoint is sampled at the ray's actual aperture hit,
    // ensuring the 3D/4D interface is metric-continuous even when a curved
    // Poincare chart varies appreciably across the aperture. The opposite
    // endpoint remains sampled at its configured centre; pointwise mode is an
    // explicit opt-in for anomalies whose two charts share a broad domain.
    const entryOverride = options.endpointMetricOverride;
    const sourceEndpointMetric = entryOverride?.side === 'source'
        ? readMetric(entryOverride.metric)
        : readMetric(sourceTransform.metricAtWorld(anomaly.source.position));
    const destinationEndpointMetric = entryOverride?.side === 'destination'
        ? rebaseMetric3(readMetric(entryOverride.metric), destinationAxes, sourceAxes)
        : rebaseMetric3(
            readMetric(destinationTransform.metricAtWorld(anomaly.destination.position)),
            destinationAxes,
            sourceAxes
        );
    const sliceMetricAt = (_sourceLocalPosition, context) => {
        if (metricSampling === 'ambient') return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const ambientPosition = context.ambientPosition;
        const normalOffset = dot4(subtract4(ambientPosition, sourceFrame.origin), sourceFrame.normal);
        const normalizedOffset = normalOffset / signedSpan;
        if (!Number.isFinite(signedSpan) || !Number.isFinite(normalizedOffset)) {
            throw new RangeError(`Anomaly optical metric received a non-finite bridge coordinate (offset=${normalOffset}, span=${signedSpan}, w=${ambientPosition.w}).`);
        }
        const t = smootherstep(clamp(normalizedOffset, 0, 1));
        if (metricSampling === 'endpoint') {
            return blendScaledPositiveDefiniteMetrics3(
                [sourceEndpointMetric, destinationEndpointMetric], [1 - t, t]
            );
        }

        const destinationWeight = t;
        const sourceWeight = 1 - destinationWeight;
        const sourceLocal = ambientToSlice(sourceFrame, ambientPosition).position;
        const destinationLocal = ambientToSlice(destinationFrame, ambientPosition).position;
        if (destinationWeight <= 1e-10) return readMetric(sourceTransform.metricAtWorld(sourceLocal));
        if (sourceWeight <= 1e-10) {
            return rebaseMetric3(
                readMetric(destinationTransform.metricAtWorld(destinationLocal)),
                destinationAxes,
                sourceAxes
            );
        }
        const sourceMetric = readMetric(sourceTransform.metricAtWorld(sourceLocal));
        const destinationMetric = rebaseMetric3(
            readMetric(destinationTransform.metricAtWorld(destinationLocal)),
            destinationAxes,
            sourceAxes
        );
        return blendScaledPositiveDefiniteMetrics3(
            [sourceMetric, destinationMetric], [sourceWeight, destinationWeight]
        );
    };

    const field = createOpticalMetricField({
        sliceFrame: sourceFrame,
        sliceMetricAt,
        refractiveIndexAt,
        wCouplingAt(position) {
            return evaluateOpticalAnomalyCoupling(anomaly, position).coupling;
        },
        normalMetricScaleAt(_position, _context, baseMetric) {
            return geometricMeanMetricScale3(baseMetric);
        },
        containsPosition(position) {
            if (metricSampling === 'endpoint' || metricSampling === 'ambient') return true;
            const sourceLocal = ambientToSlice(sourceFrame, position).position;
            const destinationLocal = ambientToSlice(destinationFrame, position).position;
            const sourceValid = typeof sourceTransform.containsMetricDomainPosition !== 'function' ||
                sourceTransform.containsMetricDomainPosition(sourceLocal);
            const destinationValid = typeof destinationTransform.containsMetricDomainPosition !== 'function' ||
                destinationTransform.containsMetricDomainPosition(destinationLocal);
            return sourceValid && destinationValid;
        },
        gradientStep
    });

    return Object.freeze({
        ...field,
        anomalyId: anomaly.id,
        anomalyRevision: anomaly.revision,
        sourceAmbient,
        destinationAmbient,
        signedSpan,
        metricSampling,
        sourceBinding,
        destinationBinding
    });
}

/**
 * Creates a topology-aware optical tracer. Traversal permission is never read:
 * only WorldTopology's explicit optical-neighbor API can authorize a crossing.
 */
function createAnomalyOpticalTracer({
    topology,
    sliceRegistry,
    sceneRegistry,
    chunkGraph = null,
    debugRenderer = null
} = {}) {
    if (!topology || typeof topology.getCorridor !== 'function' ||
        typeof topology.getOpticallyConnectedNeighbors !== 'function') {
        throw new TypeError('Anomaly optical tracing requires a WorldTopology with optical connectivity.');
    }
    if (!sliceRegistry || typeof sliceRegistry.require !== 'function') {
        throw new TypeError('Anomaly optical tracing requires a SliceWorldRegistry.');
    }
    if (!sceneRegistry || typeof sceneRegistry.intersectSegment !== 'function') {
        throw new TypeError('Anomaly optical tracing requires an OpticalSceneRegistry.');
    }

    const sliceFieldCache = new Map();
    const anomalyFieldCache = new Map();

    function getSliceField(sliceId, metricOptions = {}) {
        const binding = sliceRegistry.require(sliceId);
        const cacheKey = `${sliceId}:${binding.slice.revision ?? 1}:${metricOptions.cacheKey ?? 'default'}`;
        if (!sliceFieldCache.has(cacheKey)) {
            sliceFieldCache.set(cacheKey, createSliceOpticalField(
                binding.slice, binding.spatialTransform, metricOptions
            ));
        }
        return sliceFieldCache.get(cacheKey);
    }

    function getAnomalyField(anomaly, metricOptions = {}) {
        if (metricOptions.endpointMetricOverride) {
            return createAnomalyOpticalField(
                anomaly,
                sliceRegistry.require(anomaly.source.sliceId),
                sliceRegistry.require(anomaly.destination.sliceId),
                metricOptions
            );
        }
        const cacheKey = `${anomaly.id}:${anomaly.revision}:${metricOptions.cacheKey ?? 'default'}`;
        if (!anomalyFieldCache.has(cacheKey)) {
            anomalyFieldCache.set(cacheKey, createAnomalyOpticalField(
                anomaly,
                sliceRegistry.require(anomaly.source.sliceId),
                sliceRegistry.require(anomaly.destination.sliceId),
                metricOptions
            ));
        }
        return anomalyFieldCache.get(cacheKey);
    }

    function evaluateReachability(anomalyId, position4, targetSliceId, reachabilityOptions = {}) {
        const anomaly = topology.getCorridor(anomalyId);
        validateAnomaly(anomaly, { requireEnabled: false });
        if (!anomaly.optics.enabled) {
            return { reachable: false, reason: 'optics-disabled', anomalyId, targetSliceId };
        }

        const endpoint = resolveEndpoint(anomaly, targetSliceId);
        const fromSliceId = targetSliceId === anomaly.source.sliceId
            ? anomaly.destination.sliceId : anomaly.source.sliceId;
        if (!topology.hasOpticalConnection(fromSliceId, targetSliceId)) {
            return {
                reachable: false,
                reason: 'no-optical-topology-edge',
                anomalyId,
                fromSliceId,
                targetSliceId
            };
        }

        const targetBinding = sliceRegistry.require(targetSliceId);
        const localTarget = ambientToSlice(targetBinding.slice.frame, position4);
        const endpointDistance = Math.hypot(
            localTarget.position.x - endpoint.position.x,
            localTarget.position.y - endpoint.position.y,
            localTarget.position.z - endpoint.position.z
        );
        // Reachability normally uses the local influence field. During initial
        // aperture entry, callers may supply the anomaly centre as the
        // coupling reference: this answers whether the configured anomaly can
        // bridge the complete slice separation at full coupling, while keeping
        // aperture and chunk-spatial tests anchored to the actual ray position.
        const couplingPosition = reachabilityOptions.couplingPosition4D ?? position4;
        const coupling = evaluateOpticalAnomalyCoupling(anomaly, couplingPosition);
        const targetPlaneDistance = Math.abs(localTarget.normalOffset);
        const wReachable = targetPlaneDistance <= coupling.opticalWReach + EPSILON;
        const apertureReachable = endpointDistance <= (anomaly.optics.apertureRadius ?? anomaly.entryRadius) + EPSILON;

        let chunkReachability = null;
        if (wReachable && apertureReachable && chunkGraph) {
            if (!chunkGraph.hasSlice(fromSliceId) || !chunkGraph.hasSlice(targetSliceId)) {
                chunkReachability = {
                    reachable: false,
                    reason: 'chunk-graph-slice-unregistered'
                };
            } else {
                const fromBinding = sliceRegistry.require(fromSliceId);
                const fromLocal = ambientToSlice(fromBinding.slice.frame, position4).position;
                const sourceAddress = chunkGraph.getAddress(fromSliceId, fromLocal);
                const targetAddress = chunkGraph.getAddress(targetSliceId, endpoint.position);
                chunkReachability = chunkGraph.getOpticalReachability(sourceAddress, targetAddress, {
                    position4D: position4,
                    couplingPosition4D: couplingPosition,
                    corridorId: anomaly.id,
                    // A spherical aperture can straddle one X and one Z chunk
                    // boundary at once. Include the diagonal Manhattan-2 case
                    // so the physical aperture and graph test agree.
                    maxChunkDistance: reachabilityOptions.maxChunkDistance ?? 2
                });
            }
        }

        const reachable = wReachable && apertureReachable &&
            (chunkReachability === null || chunkReachability.reachable);
        return {
            reachable,
            reason: !wReachable ? 'insufficient-optical-w-reach' :
                !apertureReachable ? 'outside-optical-aperture' :
                    chunkReachability && !chunkReachability.reachable
                        ? chunkReachability.reason ??
                            (!chunkReachability.spatialReachable
                                ? 'spatial-distance-exceeded'
                                : !chunkReachability.wReachable
                                    ? 'insufficient-optical-w-reach'
                                    : 'optical-chunk-unreachable')
                        : null,
            anomalyId,
            fromSliceId,
            targetSliceId,
            wDistance: targetPlaneDistance,
            opticalWReach: coupling.opticalWReach,
            coupling: coupling.coupling,
            apertureDistance: endpointDistance,
            chunkReachability
        };
    }

    function trace(initialRay, options = {}) {
        const startSliceId = options.sliceId ?? initialRay?.sliceId;
        if (typeof startSliceId !== 'string' || !startSliceId.trim()) {
            throw new TypeError('An initial sliceId is required for topology-aware optical tracing.');
        }
        const maxTransitions = options.maxTransitions ?? DEFAULT_MAX_TRANSITIONS;
        if (!Number.isSafeInteger(maxTransitions) || maxTransitions < 0 || maxTransitions > 128) {
            throw new RangeError('maxTransitions must be an integer from zero through 128.');
        }

        let state = createOpticalRayState(initialRay);
        let context = { kind: 'slice', sliceId: startSliceId };
        const pathSegments = [];
        const transitions = [];
        let status = 'max-path-length';
        let terminalEvent = null;
        let segmentCount = 0;
        let transitionCount = 0;
        // Preserve the exact field instance used to solve the entry interface.
        // In endpoint mode it may contain an aperture-local metric override;
        // recreating it for the anomaly segment would introduce an artificial
        // metric jump immediately after the boundary.
        let activeAnomalyField = null;

        while (segmentCount < (maxTransitions * 2 + 1)) {
            if (context.kind === 'slice') {
                const binding = sliceRegistry.require(context.sliceId);
                const field = getSliceField(context.sliceId, options.sliceMetricOptions ?? {});
                const neighbors = topology.getOpticallyConnectedNeighbors(context.sliceId);
                const candidates = neighbors.map((neighbor) => ({
                    neighbor,
                    anomaly: topology.getCorridor(neighbor.corridorId)
                })).filter(({ anomaly }) => anomaly.type === SLICE_TRANSITION_ANOMALY);
                const callerEvent = options.sliceTraceOptions?.segmentEvent;
                const sliceOptions = { ...(options.sliceTraceOptions ?? {}) };
                delete sliceOptions.segmentEvent;
                sliceOptions.segmentEvent = (segment) => {
                    const entry = findApertureEntry(segment, candidates, binding);
                    if (entry) return entry;
                    return typeof callerEvent === 'function' ? callerEvent(segment) : null;
                };
                const result = traceOpticalRayInSlice(
                    field, sceneRegistry, context.sliceId, state, sliceOptions
                );
                pathSegments.push({ kind: 'slice', sliceId: context.sliceId, result });
                segmentCount++;
                if (result.event?.kind !== 'anomaly-entry') {
                    status = result.status;
                    terminalEvent = result.event;
                    state = result.finalState;
                    break;
                }

                if (transitionCount >= maxTransitions) {
                    result.status = 'max-transitions';
                    result.event = { kind: 'max-transitions', maxTransitions };
                    status = 'max-transitions';
                    terminalEvent = result.event;
                    state = result.finalState;
                    break;
                }
                const anomaly = topology.getCorridor(result.event.anomalyId);
                const incidentMetric = field.sample(result.event.ambientPosition).tangentMetric;
                const anomalyField = getAnomalyField(anomaly, {
                    ...(options.anomalyMetricOptions ?? {}),
                    endpointMetricOverride: { side: result.event.side, metric: incidentMetric }
                });
                if (Math.abs(anomalyField.signedSpan) > anomaly.optics.maxWOpticalReach + EPSILON) {
                    result.status = 'optical-range-limit';
                    result.event = {
                        kind: 'optical-range-limit', anomalyId: anomaly.id,
                        requiredWReach: Math.abs(anomalyField.signedSpan),
                        maximumWReach: anomaly.optics.maxWOpticalReach
                    };
                    status = result.status;
                    terminalEvent = result.event;
                    state = result.finalState;
                    break;
                }
                const entryTargetSliceId = result.event.side === 'source'
                    ? anomaly.destination.sliceId : anomaly.source.sliceId;
                const entryReachability = evaluateReachability(
                    anomaly.id,
                    result.event.ambientPosition,
                    entryTargetSliceId,
                    {
                        ...(options.chunkReachabilityOptions ?? {}),
                        // Validate the anomaly's full configured W bridge at
                        // its maximum-coupling centre. Local coupling at the
                        // aperture still controls whether momentum can enter.
                        couplingPosition4D: anomaly.influence.center
                    }
                );
                if (!entryReachability.reachable) {
                    result.status = 'optical-entry-blocked';
                    result.event = {
                        kind: 'optical-entry-blocked',
                        anomalyId: anomaly.id,
                        reachability: entryReachability
                    };
                    status = result.status;
                    terminalEvent = result.event;
                    state = result.finalState;
                    break;
                }
                const entryResult = transferSliceMomentumIntoAnomaly({
                    anomaly,
                    anomalyField,
                    sliceField: field,
                    slice: binding.slice,
                    state: result.finalState,
                    event: result.event,
                    side: result.event.side
                });
                result.status = entryResult.transmitted ? 'anomaly-entry' : 'interface-blocked';
                result.interface = entryResult.diagnostics;
                if (!entryResult.transmitted) {
                    status = 'interface-blocked';
                    terminalEvent = { kind: 'interface-blocked', ...entryResult.diagnostics };
                    state = result.finalState;
                    break;
                }
                state = createOpticalRayState({
                    ...result.finalState,
                    momentum: entryResult.momentum
                });
                activeAnomalyField = anomalyField;
                context = {
                    kind: 'anomaly',
                    anomalyId: anomaly.id,
                    entrySide: result.event.side
                };
                transitions.push({
                    anomalyId: anomaly.id,
                    fromSliceId: context.entrySide === 'source' ? anomaly.source.sliceId : anomaly.destination.sliceId,
                    toSliceId: context.entrySide === 'source' ? anomaly.destination.sliceId : anomaly.source.sliceId,
                    direction: 'into-anomaly',
                    interface: entryResult.diagnostics
                });
                continue;
            }

            const anomaly = topology.getCorridor(context.anomalyId);
            const anomalyField = activeAnomalyField ??
                getAnomalyField(anomaly, options.anomalyMetricOptions ?? {});
            const entryOpticalPath = state.opticalPathLength;
            const result = traceOpticalRay(anomalyField, state, {
                ...(options.anomalyTraceOptions ?? {}),
                segmentEvent: (segment) => findAnomalyEvent(
                    segment,
                    anomaly,
                    context.entrySide,
                    anomalyField,
                    (event) => evaluateReachability(
                        anomaly.id,
                        event.ambientPosition,
                        event.sliceId,
                        options.chunkReachabilityOptions ?? {}
                    )
                )
            });
            const attenuationDistance = Math.max(0,
                result.finalState.opticalPathLength - entryOpticalPath
            );
            const attenuation = Math.exp(-anomaly.optics.attenuationPerUnit * attenuationDistance);
            result.finalState.intensity *= attenuation;
            pathSegments.push({ kind: 'anomaly', anomalyId: anomaly.id, result });
            segmentCount++;

            if (result.event?.kind !== 'anomaly-exit') {
                status = result.event?.kind ?? result.status;
                terminalEvent = result.event;
                state = result.finalState;
                break;
            }

            const exit = result.event;
            const destinationBinding = sliceRegistry.require(exit.sliceId);
            const destinationField = getSliceField(exit.sliceId, options.sliceMetricOptions ?? {});
            const exitResult = transferAnomalyMomentumIntoSlice({
                anomaly,
                anomalyField,
                sliceField: destinationField,
                slice: destinationBinding.slice,
                state: result.finalState,
                event: exit
            });
            result.status = exitResult.transmitted ? 'anomaly-exit' : 'interface-blocked';
            result.interface = exitResult.diagnostics;
            if (!exitResult.transmitted) {
                status = 'interface-blocked';
                terminalEvent = { kind: 'interface-blocked', ...exitResult.diagnostics };
                state = result.finalState;
                break;
            }
            state = createOpticalRayState({
                ...result.finalState,
                momentum: exitResult.momentum,
                intensity: result.finalState.intensity * anomaly.optics.transmission
            });
            transitions.push({
                anomalyId: anomaly.id,
                fromSliceId: anomaly.source.sliceId === exit.sliceId
                    ? anomaly.destination.sliceId : anomaly.source.sliceId,
                toSliceId: exit.sliceId,
                direction: 'out-of-anomaly',
                interface: exitResult.diagnostics
            });
            activeAnomalyField = null;
            context = { kind: 'slice', sliceId: exit.sliceId };
            transitionCount++;
            if (transitionCount > maxTransitions) {
                status = 'max-transitions';
                terminalEvent = { kind: 'max-transitions', maxTransitions };
                break;
            }
        }

        const diagnostics = {
            segmentCount,
            transitionCount,
            sliceSegments: pathSegments.filter((segment) => segment.kind === 'slice').length,
            anomalySegments: pathSegments.filter((segment) => segment.kind === 'anomaly').length,
            acceptedSteps: pathSegments.reduce((sum, segment) => sum + (segment.result.diagnostics?.acceptedSteps ?? 0), 0),
            rejectedSteps: pathSegments.reduce((sum, segment) => sum + (segment.result.diagnostics?.rejectedSteps ?? 0), 0),
            pathLength: state.opticalPathLength,
            travelTime: state.travelTime,
            intensity: state.intensity
        };
        const combined = {
            status,
            event: terminalEvent,
            finalState: state,
            context,
            pathSegments,
            transitions,
            diagnostics
        };

        if (options.drawDebug && debugRenderer) {
            renderTopologyDebug(combined, sliceRegistry, debugRenderer, options.debugStyle ?? {});
        }
        return combined;
    }

    return Object.freeze({
        trace,
        createAnomalyField(anomalyId, metricOptions = {}) {
            return getAnomalyField(topology.getCorridor(anomalyId), metricOptions);
        },
        evaluateReachability,
        getOpticallyConnectedNeighbors(sliceId) {
            return topology.getOpticallyConnectedNeighbors(sliceId);
        },
        getOpticalChunkReachability(sourceAddress, targetAddress, reachabilityOptions = {}) {
            if (!chunkGraph || typeof chunkGraph.getOpticalReachability !== 'function') {
                throw new Error('Optical chunk reachability requires a SpatialChunkGraph.');
            }
            return chunkGraph.getOpticalReachability(sourceAddress, targetAddress, reachabilityOptions);
        },
        getOpticallyReachableChunkCandidates(sourceSliceId, position4, reachabilityOptions = {}) {
            if (!chunkGraph || typeof chunkGraph.getOpticallyReachableChunkCandidates !== 'function') {
                throw new Error('Optically reachable chunk candidates require a SpatialChunkGraph.');
            }
            return chunkGraph.getOpticallyReachableChunkCandidates(sourceSliceId, position4, reachabilityOptions);
        },
        clearCache() {
            sliceFieldCache.clear();
            anomalyFieldCache.clear();
        }
    });
}

function findApertureEntry(segment, candidates, binding) {
    const start = ambientToSlice(binding.slice.frame, segment.startPosition).position;
    const end = ambientToSlice(binding.slice.frame, segment.endPosition).position;
    let best = null;
    for (const { neighbor, anomaly } of candidates) {
        const side = neighbor.entrySide;
        if (side === 'destination' && !anomaly.optics.bidirectional) continue;
        const endpoint = anomaly[side];
        const radius = anomaly.optics.apertureRadius ?? anomaly.entryRadius;
        // Slice coordinates are records, while the small vector helpers below
        // intentionally use dense arrays. Convert explicitly at this boundary.
        const hit = intersectSphereEntry(
            [start.x, start.y, start.z],
            [end.x, end.y, end.z],
            [endpoint.position.x, endpoint.position.y, endpoint.position.z],
            radius
        );
        if (!hit || (best && hit.parameter >= best.parameter)) continue;
        const localPosition = { x: hit.point[0], y: hit.point[1], z: hit.point[2] };
        const ambientPosition = sliceToAmbient(binding.slice.frame, localPosition);
        if (!containsAmbientPoint(anomaly.region, ambientPosition, 1e-6)) continue;
        best = {
            kind: 'anomaly-entry',
            parameter: hit.parameter,
            anomalyId: anomaly.id,
            side,
            apertureNormal: hit.normal,
            ambientPosition,
            localPosition
        };
    }
    return best;
}

function findAnomalyEvent(segment, anomaly, entrySide, field, evaluateExitReachability = null) {
    const events = [];
    const sourceBinding = field.sourceBinding;
    const destinationBinding = field.destinationBinding;
    const sourceAmbient = field.sourceAmbient;
    const destinationAmbient = field.destinationAmbient;
    const normalSign = Math.sign(field.signedSpan);
    const orientedNormal = scale4(sourceBinding.slice.frame.normal, normalSign);
    const apertureRadius = anomaly.optics.apertureRadius ?? anomaly.entryRadius;

    for (const side of ['source', 'destination']) {
        if (!anomaly.optics.bidirectional && side === entrySide) continue;
        const binding = side === 'source' ? sourceBinding : destinationBinding;
        const endpoint = side === 'source' ? anomaly.source : anomaly.destination;
        const endpointAmbient = side === 'source' ? sourceAmbient : destinationAmbient;
        const inwardNormal = side === 'source' ? orientedNormal : scale4(orientedNormal, -1);
        const d0 = dot4(subtract4(segment.startPosition, endpointAmbient), inwardNormal);
        const d1 = dot4(subtract4(segment.endPosition, endpointAmbient), inwardNormal);
        if (!(d0 > EPSILON && d1 <= EPSILON)) continue;
        const parameter = d0 / (d0 - d1);
        const point = interpolate4(segment.startPosition, segment.endPosition, parameter);
        const local = ambientToSlice(binding.slice.frame, point).position;
        const normal = normalize3OrFallback([
            local.x - endpoint.position.x,
            local.y - endpoint.position.y,
            local.z - endpoint.position.z
        ], projectAmbientVectorToFrame(segment.endPosition, segment.startPosition, binding.slice.frame.axes));
        const apertureDistance = Math.hypot(
            local.x - endpoint.position.x,
            local.y - endpoint.position.y,
            local.z - endpoint.position.z
        );
        if (apertureDistance <= apertureRadius + 1e-6) {
            const exitEvent = {
                kind: 'anomaly-exit',
                anomalyId: anomaly.id,
                side,
                sliceId: endpoint.sliceId,
                localPosition: local,
                apertureNormal: normal,
                ambientPosition: point
            };
            const reachability = typeof evaluateExitReachability === 'function'
                ? evaluateExitReachability(exitEvent) : null;
            events.push({
                parameter,
                priority: 0,
                event: reachability && !reachability.reachable
                    ? {
                        kind: 'optical-exit-blocked',
                        anomalyId: anomaly.id,
                        side,
                        sliceId: endpoint.sliceId,
                        ambientPosition: point,
                        reachability
                    }
                    : exitEvent
            });
        }
    }

    const regionParameter = segmentAabbExitParameter(
        segment.startPosition, segment.endPosition, anomaly.region
    );
    if (regionParameter !== null) {
        events.push({
            parameter: regionParameter,
            priority: 1,
            event: { kind: 'anomaly-boundary', anomalyId: anomaly.id }
        });
    }

    const horizonParameter = segmentSphereExitParameter(
        segment.startPosition,
        segment.endPosition,
        anomaly.influence.center,
        anomaly.influence.horizonRadius
    );
    if (horizonParameter !== null) {
        events.push({
            parameter: horizonParameter,
            priority: 2,
            event: { kind: 'optical-horizon', anomalyId: anomaly.id }
        });
    }

    if (!events.length) return null;
    events.sort((left, right) => left.parameter - right.parameter || left.priority - right.priority);
    return { ...events[0].event, parameter: events[0].parameter };
}

function transferSliceMomentumIntoAnomaly({ anomaly, anomalyField, sliceField, slice, state, event, side }) {
    const point = event.ambientPosition ?? state.position;
    const sliceMomentum = projectCovectorToFrame(state.momentum, slice.frame.axes);
    const sliceSample = sliceField.sample(point);
    const aperture = event.apertureNormal;
    const decomposition = decomposeCovector3(sliceMomentum, aperture, sliceSample.tangentCometric);
    const incomingHamiltonian = evaluateOpticalHamiltonian(sliceField, point, state.momentum);
    const tangentAmbient = liftCovectorFromFrame(slice.frame.axes, decomposition.tangential);
    const anomalyMomentumTangent = projectCovectorToFrame(tangentAmbient, anomalyField.frame.axes);
    const anomalySample = anomalyField.sample(point);
    const tangentQuadratic = quadratic3(anomalySample.tangentCometric, anomalyMomentumTangent);
    const availableTwiceHamiltonian = 2 * incomingHamiltonian - tangentQuadratic;
    const coupling = anomalySample.wCoupling;
    if (coupling <= 1e-8 || availableTwiceHamiltonian < -1e-8) {
        return {
            transmitted: false,
            momentum: null,
            diagnostics: {
                rule: 'aperture-normal-to-anomaly-normal',
                reason: coupling <= 1e-8 ? 'zero-w-optical-coupling' : 'insufficient-interface-energy',
                incomingHamiltonian,
                tangentHamiltonian: tangentQuadratic / 2,
                wCoupling: coupling
            }
        };
    }

    // A 3D aperture boundary has a two-dimensional normal space in ambient R4:
    // its radial conormal plus the slice normal. Aim the unconstrained launch
    // component toward the anomaly influence centre. The radial component is
    // deliberately biasable: the radial W-coupling gradient can refract a ray
    // away from the core, so a modest inward bias helps it enter the full-field
    // region before the ray is redirected toward the opposite aperture.
    const radialCovector = liftCovectorFromFrame(slice.frame.axes, aperture);
    const wCovector = anomalyField.frame.normal;
    const targetDirection = subtract4(anomaly.influence.center, point);
    const cometric = anomalySample.cometric;
    const radialImage = multiply4(cometric, radialCovector);
    const wImage = multiply4(cometric, wCovector);
    const g00 = dot4(radialCovector, radialImage);
    const g01 = dot4(radialCovector, wImage);
    const g11 = dot4(wCovector, wImage);
    const determinant = g00 * g11 - g01 * g01;
    if (!Number.isFinite(determinant) || determinant <= 1e-14) {
        return {
            transmitted: false,
            momentum: null,
            diagnostics: {
                rule: 'aperture-normal-to-anomaly-normal',
                reason: 'degenerate-anomaly-interface-normal-plane',
                incomingHamiltonian,
                wCoupling: coupling
            }
        };
    }
    const rhs0 = dot4(radialCovector, targetDirection);
    const rhs1 = dot4(wCovector, targetDirection);
    let coefficient0 = anomaly.optics.entryRadialBias *
        (rhs0 * g11 - rhs1 * g01) / determinant;
    let coefficient1 = (rhs1 * g00 - rhs0 * g01) / determinant;
    let preferredNormalCovector = add4(
        scale4(radialCovector, coefficient0),
        scale4(wCovector, coefficient1)
    );
    let normalQuadratic = dot4(
        preferredNormalCovector,
        multiply4(cometric, preferredNormalCovector)
    );
    if (!Number.isFinite(normalQuadratic) || normalQuadratic <= 1e-14) {
        // A fixed endpoint-centred field can put its centre exactly on the
        // aperture. In that degenerate case, preserve the old axial W transfer.
        const expectedWSign = Math.sign(dot4(
            subtract4(anomalyField.destinationAmbient, anomalyField.sourceAmbient),
            anomalyField.frame.normal
        )) * (side === 'source' ? 1 : -1);
        coefficient0 = 0;
        coefficient1 = expectedWSign || 1;
        preferredNormalCovector = scale4(wCovector, coefficient1);
        normalQuadratic = dot4(preferredNormalCovector, multiply4(cometric, preferredNormalCovector));
    }

    const normalScale = Math.sqrt(Math.max(0, availableTwiceHamiltonian) / normalQuadratic);
    const momentum = add4(tangentAmbient, scale4(preferredNormalCovector, normalScale));
    const outgoingHamiltonian = evaluateOpticalHamiltonian(anomalyField, point, momentum);
    const drift = Math.abs(outgoingHamiltonian - incomingHamiltonian);
    return {
        transmitted: drift <= 1e-5 * Math.max(1, incomingHamiltonian),
        momentum,
        diagnostics: {
            rule: 'aperture-normal-to-anomaly-normal',
            entryRadialBias: anomaly.optics.entryRadialBias,
            reason: drift <= 1e-5 * Math.max(1, incomingHamiltonian) ? null : 'interface-hamiltonian-mismatch',
            incomingHamiltonian,
            outgoingHamiltonian,
            hamiltonianDrift: drift,
            wCoupling: coupling,
            normalMomentum: normalScale,
            preferredAnomalyDirection: {
                x: radialImage.x * coefficient0 + wImage.x * coefficient1,
                y: radialImage.y * coefficient0 + wImage.y * coefficient1,
                z: radialImage.z * coefficient0 + wImage.z * coefficient1,
                w: radialImage.w * coefficient0 + wImage.w * coefficient1
            },
            preservedApertureTangentMomentum: true
        }
    };
}

function transferAnomalyMomentumIntoSlice({ anomaly, anomalyField, sliceField, slice, state, event }) {
    const point = event.ambientPosition ?? state.position;
    const sliceSample = sliceField.sample(point);
    const sliceMomentum = projectCovectorToFrame(state.momentum, slice.frame.axes);
    const decomposition = decomposeCovector3(
        sliceMomentum, event.apertureNormal, sliceSample.tangentCometric
    );
    const incomingHamiltonian = evaluateOpticalHamiltonian(anomalyField, point, state.momentum);
    const tangentQuadratic = quadratic3(sliceSample.tangentCometric, decomposition.tangential);
    const availableTwiceHamiltonian = 2 * incomingHamiltonian - tangentQuadratic;
    const normalNormSquared = decomposition.normalNormSquared;
    if (availableTwiceHamiltonian < -1e-8 || normalNormSquared <= 1e-12) {
        return {
            transmitted: false,
            momentum: null,
            diagnostics: {
                rule: 'anomaly-normal-to-aperture-normal',
                reason: 'insufficient-interface-energy',
                incomingHamiltonian,
                tangentHamiltonian: tangentQuadratic / 2
            }
        };
    }
    const radialMomentum = Math.sqrt(Math.max(0, availableTwiceHamiltonian) / normalNormSquared);
    const outgoingLocal = add3(
        decomposition.tangential,
        scale3(event.apertureNormal, radialMomentum)
    );
    const momentum = liftCovectorFromFrame(slice.frame.axes, outgoingLocal);
    const outgoingHamiltonian = evaluateOpticalHamiltonian(sliceField, point, momentum);
    const drift = Math.abs(outgoingHamiltonian - incomingHamiltonian);
    return {
        transmitted: drift <= 1e-5 * Math.max(1, incomingHamiltonian),
        momentum,
        diagnostics: {
            rule: 'anomaly-normal-to-aperture-normal',
            reason: drift <= 1e-5 * Math.max(1, incomingHamiltonian) ? null : 'interface-hamiltonian-mismatch',
            incomingHamiltonian,
            outgoingHamiltonian,
            hamiltonianDrift: drift,
            normalMomentum: radialMomentum,
            preservedApertureTangentMomentum: true
        }
    };
}

function decomposeCovector3(momentum, apertureConormal, cometric) {
    const transformed = multiply3(cometric, apertureConormal);
    const normalNormSquared = dot3(apertureConormal, transformed);
    if (!Number.isFinite(normalNormSquared) || normalNormSquared <= 1e-12) {
        throw new RangeError('Aperture conormal is degenerate in the slice optical metric.');
    }
    const metricMomentum = multiply3(cometric, momentum);
    const coefficient = dot3(apertureConormal, metricMomentum) / normalNormSquared;
    const tangential = subtract3(momentum, scale3(apertureConormal, coefficient));
    return { coefficient, tangential, normalNormSquared };
}

function resolveEndpoint(anomaly, sliceId) {
    if (anomaly.source.sliceId === sliceId) return anomaly.source;
    if (anomaly.destination.sliceId === sliceId) return anomaly.destination;
    throw new Error(`Slice ${sliceId} is not an endpoint of anomaly ${anomaly.id}.`);
}

function validateAnomaly(anomaly, { requireEnabled = true } = {}) {
    if (!anomaly || anomaly.type !== SLICE_TRANSITION_ANOMALY) {
        throw new TypeError('Phase 16C optical transport currently requires a slice-transition anomaly.');
    }
    if (requireEnabled && !anomaly.optics?.enabled) {
        throw new RangeError(`Anomaly ${anomaly.id} is not optically enabled.`);
    }
    if (!anomaly.influence?.center || !Number.isFinite(anomaly.influence.horizonRadius) ||
        !Number.isFinite(anomaly.influence.innerRadius)) {
        throw new TypeError(`Anomaly ${anomaly.id} has no resolved optical influence field.`);
    }
}

function validateBinding(binding, expectedSliceId, label) {
    if (!binding?.slice?.id || binding.slice.id !== expectedSliceId || !binding.slice.frame ||
        typeof binding.spatialTransform?.metricAtWorld !== 'function') {
        throw new TypeError(`Anomaly optical ${label} binding is incomplete or belongs to another slice.`);
    }
}

function intersectSphereEntry(from, to, center, radius) {
    const direction = subtract3(to, from);
    const offset = subtract3(from, center);
    const a = dot3(direction, direction);
    if (a <= 1e-16) return null;
    const b = 2 * dot3(offset, direction);
    const c = dot3(offset, offset) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(Math.max(0, discriminant));
    const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((x, y) => x - y);
    for (const parameter of roots) {
        if (parameter < 0 || parameter > 1) continue;
        const point = add3(from, scale3(direction, parameter));
        const radial = normalize3OrFallback(subtract3(point, center), [1, 0, 0]);
        if (dot3(direction, radial) < -1e-10) return { parameter, point, normal: radial };
    }
    return null;
}

function segmentAabbExitParameter(from, to, bounds) {
    const direction = subtract4(to, from);
    let best = Infinity;
    for (const axis of AXES4) {
        if (to[axis] > bounds.max[axis] && direction[axis] > 0) {
            best = Math.min(best, (bounds.max[axis] - from[axis]) / direction[axis]);
        } else if (to[axis] < bounds.min[axis] && direction[axis] < 0) {
            best = Math.min(best, (bounds.min[axis] - from[axis]) / direction[axis]);
        }
    }
    return Number.isFinite(best) && best >= 0 && best <= 1 ? best : null;
}

function segmentSphereExitParameter(from, to, center, radius) {
    const direction = subtract4(to, from);
    const offset = subtract4(from, center);
    const startDistance = norm4(offset);
    const endDistance = norm4(subtract4(to, center));
    if (startDistance >= radius - 1e-8 || endDistance < radius) return null;
    const a = dot4(direction, direction);
    if (a <= 1e-16) return null;
    const b = 2 * dot4(offset, direction);
    const c = dot4(offset, offset) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const parameter = (-b + root) / (2 * a);
    return parameter >= 0 && parameter <= 1 ? parameter : null;
}

function readMetric(metric) {
    const values = Array.isArray(metric) || ArrayBuffer.isView(metric) ? metric : metric?.values;
    if ((!Array.isArray(values) && !ArrayBuffer.isView(values)) || values.length !== 9) {
        throw new TypeError('SpatialTransform.metricAtWorld() must provide a 3x3 metric.');
    }
    const result = Array.from(values, Number);
    if (!result.every(Number.isFinite)) throw new TypeError('Slice optical metric contains non-finite values.');
    return result;
}

function rebaseMetric3(metric, fromAxes, toAxes) {
    const rotation = Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 3 }, (_, column) => dot4(toAxes[row], fromAxes[column]))
    );
    const result = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            for (let a = 0; a < 3; a++) {
                for (let b = 0; b < 3; b++) {
                    result[row * 3 + column] += rotation[row][a] * metric[a * 3 + b] * rotation[column][b];
                }
            }
        }
    }
    return result;
}

function projectCovectorToFrame(vector, axes) {
    return axes.map((axis) => dot4(vector, axis));
}

function projectAmbientVectorToFrame(to, from, axes) {
    const delta = subtract4(to, from);
    return axes.map((axis) => dot4(delta, axis));
}

function liftCovectorFromFrame(axes, vector) {
    let result = { x: 0, y: 0, z: 0, w: 0 };
    for (let index = 0; index < 3; index++) {
        result = {
            x: result.x + axes[index].x * vector[index],
            y: result.y + axes[index].y * vector[index],
            z: result.z + axes[index].z * vector[index],
            w: result.w + axes[index].w * vector[index]
        };
    }
    return result;
}

function multiply4(matrix, vector) {
    const axes = ['x', 'y', 'z', 'w'];
    const values = new Array(4);
    for (let row = 0; row < 4; row++) {
        values[row] = 0;
        for (let column = 0; column < 4; column++) {
            values[row] += matrix[row * 4 + column] * vector[axes[column]];
        }
    }
    return { x: values[0], y: values[1], z: values[2], w: values[3] };
}

function multiply3(matrix, vector) {
    return [
        matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
        matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
        matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]
    ];
}

function quadratic3(matrix, vector) {
    return dot3(vector, multiply3(matrix, vector));
}

function add3(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract3(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(vector, factor) {
    return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3OrFallback(vector, fallback) {
    const length = Math.hypot(vector[0], vector[1], vector[2]);
    if (length > 1e-12) return vector.map((value) => value / length);
    const fallbackLength = Math.hypot(fallback[0], fallback[1], fallback[2]);
    if (fallbackLength <= 1e-12) return [1, 0, 0];
    return fallback.map((value) => value / fallbackLength);
}

function interpolate4(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        w: a.w + (b.w - a.w) * t
    };
}

function smootherstep(value) {
    const t = clamp(value, 0, 1);
    // The polynomial can overshoot by a few ulps at t≈1. Keep the convex
    // interpolation weights exactly inside [0, 1] before blending SPD metrics.
    if (t === 0 || t === 1) return t;
    return clamp(t * t * t * (t * (t * 6 - 15) + 10), 0, 1);
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function renderTopologyDebug(result, sliceRegistry, debugRenderer, style) {
    // Slice segments are rendered with their own transforms. The anomaly
    // segments remain authoritative R4 in the returned result; a dedicated
    // 4D projected debug view is added separately from this CPU transport pass.
    for (const segment of result.pathSegments) {
        if (segment.kind !== 'slice') continue;
        const binding = sliceRegistry.require(segment.sliceId);
        debugRenderer.renderTrace(segment.result, {
            slice: binding.slice,
            spatialTransform: binding.spatialTransform,
            ...style
        });
    }
}

export {
    createAnomalyOpticalField,
    createAnomalyOpticalTracer
};
