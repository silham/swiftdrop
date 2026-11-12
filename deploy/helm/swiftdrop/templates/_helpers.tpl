{{/* Owner: M10 (chart by M1). */}}
{{- define "swiftdrop.fullname" -}}
{{- printf "%s" .Release.Name | trunc 40 | trimSuffix "-" -}}
{{- end -}}

{{- define "swiftdrop.labels" -}}
app.kubernetes.io/name: swiftdrop
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* selector labels for one component: include "swiftdrop.selector" (list . "api") */}}
{{- define "swiftdrop.selector" -}}
{{- $root := index . 0 -}}
app.kubernetes.io/name: swiftdrop
app.kubernetes.io/instance: {{ $root.Release.Name }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end -}}

{{- define "swiftdrop.image" -}}
{{- $root := index . 0 -}}
{{- printf "%sswiftdrop/%s:%s" $root.Values.image.registry (index . 1) $root.Values.image.tag -}}
{{- end -}}

{{- define "swiftdrop.secretName" -}}
{{- default (printf "%s-secrets" (include "swiftdrop.fullname" .)) .Values.existingSecret -}}
{{- end -}}

{{/* Service host names */}}
{{- define "swiftdrop.host" -}}
{{- printf "%s-%s" (include "swiftdrop.fullname" (index . 0)) (index . 1) -}}
{{- end -}}

{{/* Everything the app containers read: ConfigMap + Secret */}}
{{- define "swiftdrop.envFrom" -}}
- configMapRef:
    name: {{ include "swiftdrop.fullname" . }}-config
- secretRef:
    name: {{ include "swiftdrop.secretName" . }}
{{- end -}}

{{- define "swiftdrop.appSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
allowPrivilegeEscalation: false
capabilities: { drop: [ALL] }
{{- end -}}

{{/* A secret value: given in values → kept from the existing Secret → generated. */}}
{{- define "swiftdrop.secretValue" -}}
{{- $given := index .root.Values.secrets .key -}}
{{- if $given -}}{{ $given }}{{- else if hasKey .old .stored -}}{{ index .old .stored | b64dec }}{{- else -}}{{ .generate }}{{- end -}}
{{- end -}}
