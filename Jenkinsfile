pipeline {
    agent { label 'mern-deploy' }
    options {
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
        timeout(time: 15, unit: 'MINUTES')
    }
    parameters {
        string(name: 'IMAGE_TAG', defaultValue: '', description: 'Full commit SHA-run ID-run attempt from GitHub Actions')
    }
    environment {
        ARTIFACT_ROOT = '/opt/ci-artifacts/mern-todo'
        // Secret text credential containing the Server 2 hostname/IP.
        DEPLOY_HOST = credentials('mern-deploy-host')
    }
    stages {
        stage('Validate artifact') {
            steps {
                script {
                    if (!(params.IMAGE_TAG ==~ /[0-9a-f]{40}-[0-9]+-[0-9]+/)) {
                        error('Invalid IMAGE_TAG')
                    }
                }
                sh '''#!/usr/bin/env bash
set -euo pipefail
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 1
cd "$ARTIFACT_ROOT/$IMAGE_TAG"
sha256sum --check SHA256SUMS
'''
            }
        }
        stage('Transfer and deploy') {
            steps {
                sshagent(credentials: ['mern-server2-ssh']) {
                    withCredentials([file(credentialsId: 'mern-known-hosts', variable: 'KNOWN_HOSTS')]) {
                        sh '''#!/usr/bin/env bash
set -euo pipefail
remote="deploy@$DEPLOY_HOST"
release="/opt/mern-todo/releases/$IMAGE_TAG"
opts=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$KNOWN_HOSTS" -o ConnectTimeout=10)
ssh "${opts[@]}" "$remote" "mkdir -p '$release'"
scp "${opts[@]}" "$ARTIFACT_ROOT/$IMAGE_TAG/"{images.tar,compose.yml,deploy.sh,SHA256SUMS} "$remote:$release/"
ssh "${opts[@]}" "$remote" "cd '$release' && sha256sum --check SHA256SUMS && bash deploy.sh '$IMAGE_TAG'"
'''
                    }
                }
            }
        }
    }
}
