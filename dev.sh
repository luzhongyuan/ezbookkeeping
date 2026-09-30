#!/usr/bin/env sh

TYPE="all"
CONF_PATH=""
ENV_FILE=""
BACKEND_PID=""
FRONTEND_PID=""

echo_red() {
    printf '\033[31m%s\033[0m\n' "$1"
}

echo_green() {
    printf '\033[32m%s\033[0m\n' "$1"
}

check_dependency() {
    for cmd in $1
    do
        if ! which "$cmd" > /dev/null; then
            echo_red "Error: \"$cmd\" is required."
            exit 127
        fi
    done
}

show_help() {
    cat <<-EOF
ezBookkeeping local development script

Usage:
    dev.sh [type] [options]

Types:
    all                     Start backend server and frontend dev server (default)
    backend                 Start backend server only
    frontend                Start frontend dev server only

Options:
    -c, --conf-path <file>  Custom backend config file path
    -e, --env-file <file>   Custom environment variable file path (default: .env)
    -h, --help              Show help

Endpoints:
    Backend:  http://127.0.0.1:8080 (config in conf/ezbookkeeping.ini, SQLite by default)
    Frontend: http://localhost:8081 (open this in browser, /api requests are proxied to backend)
EOF
}

parse_args() {
    if [ "$1" = "all" ] || [ "$1" = "backend" ] || [ "$1" = "frontend" ]; then
        TYPE="$1"
        shift 1
    fi

    while [ ${#} -gt 0 ]; do
        case "${1}" in
            --conf-path | -c)
                CONF_PATH="$2"
                shift
                ;;
            --env-file | -e)
                ENV_FILE="$2"
                shift
                ;;
            --help | -h)
                show_help
                exit 0
                ;;
            *)
                echo_red "Invalid argument: $1"
                show_help
                exit 2
                ;;
        esac

        shift 1
    done
}

check_type_dependencies() {
    if [ "$TYPE" = "backend" ] || [ "$TYPE" = "all" ]; then
        check_dependency "go"
    fi

    if [ "$TYPE" = "frontend" ] || [ "$TYPE" = "all" ]; then
        check_dependency "node npm"
    fi
}

# The backend does not read ".env" itself, its variables must be exported before startup
load_env_file() {
    if [ -z "$ENV_FILE" ]; then
        ENV_FILE=".env"
    else
        ENV_EXPLICIT="1"
    fi

    case "$ENV_FILE" in
        */*) ENV_FILE_PATH="$ENV_FILE" ;;
        *) ENV_FILE_PATH="./$ENV_FILE" ;;
    esac

    if [ ! -f "$ENV_FILE_PATH" ]; then
        if [ -n "$ENV_EXPLICIT" ]; then
            echo_red "Error: env file \"$ENV_FILE\" not found."
            exit 1
        fi

        return
    fi

    count="$(grep -c -E '^[[:space:]]*(export[[:space:]]+)?EBK' "$ENV_FILE_PATH" 2> /dev/null)"

    if [ -z "$count" ]; then
        count="0"
    fi

    echo "Loading $count environment variables from \"$ENV_FILE\"..."

    if ! sh -n "$ENV_FILE_PATH" 2> /dev/null; then
        echo_red "Error: failed to parse env file \"$ENV_FILE\"."
        exit 1
    fi

    # "set -a" exports every variable assigned by the env file, no matter whether the
    # file uses "export KEY=VALUE" or plain "KEY=VALUE" lines
    set -a
    . "$ENV_FILE_PATH"
    set +a
}

install_frontend_dependencies_if_needed() {
    if [ -d node_modules ]; then
        return
    fi

    echo "Frontend dependencies not found, executing \"npm install\"..."
    npm install

    if [ "$?" != "0" ]; then
        echo_red "Error: Failed to install frontend dependencies"
        exit 1
    fi
}

create_runtime_directories_if_needed() {
    # The backend requires these paths to exist at startup (SQLite db, local storage, log files)
    for dir in data storage log
    do
        if [ ! -d "$dir" ]; then
            echo "Creating runtime directory \"$dir/\"..."
            mkdir -p "$dir"
        fi
    done
}

check_port_available() {
    pid="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2> /dev/null | head -1)"

    if [ -n "$pid" ]; then
        echo_red "Error: port $1 (for $2) is already in use by process $pid, stop it before starting dev servers"
        exit 1
    fi
}

check_default_ports_available() {
    if ! which lsof > /dev/null; then
        return
    fi

    # The backend port may be overridden by the custom config file
    if { [ "$TYPE" = "backend" ] || [ "$TYPE" = "all" ]; } && [ -z "$CONF_PATH" ]; then
        check_port_available "8080" "backend"
    fi

    if [ "$TYPE" = "frontend" ] || [ "$TYPE" = "all" ]; then
        check_port_available "8081" "frontend"
    fi
}

start_backend() {
    echo "Starting backend server (http://127.0.0.1:8080)..."

    if [ -n "$CONF_PATH" ]; then
        go run . --conf-path "$CONF_PATH" server run &
    else
        go run . server run &
    fi

    BACKEND_PID=$!
}

start_frontend() {
    echo "Starting frontend dev server (http://localhost:8081)..."
    npm run serve &
    FRONTEND_PID=$!
}

# "Z" state means the process has exited but has not been reaped yet
process_is_alive() {
    state="$(ps -p "$1" -o stat= 2> /dev/null)"

    if [ -z "$state" ] || [ "${state#Z}" != "$state" ]; then
        return 1
    fi

    return 0
}

stop_dev_servers() {
    echo ""
    echo "Stopping dev servers..."

    # Kill child processes before the parents, otherwise the compiled binary
    # spawned by "go run" and the vite dev server spawned by "npm run serve" survive
    if [ -n "$FRONTEND_PID" ]; then
        pkill -TERM -P "$FRONTEND_PID" 2> /dev/null
        kill "$FRONTEND_PID" 2> /dev/null
    fi

    if [ -n "$BACKEND_PID" ]; then
        pkill -TERM -P "$BACKEND_PID" 2> /dev/null
        kill "$BACKEND_PID" 2> /dev/null
    fi

    wait 2> /dev/null
}

main() {
    parse_args "$@"
    load_env_file
    check_type_dependencies
    check_default_ports_available

    if [ "$TYPE" = "backend" ] || [ "$TYPE" = "all" ]; then
        create_runtime_directories_if_needed
        start_backend
    fi

    if [ "$TYPE" = "frontend" ] || [ "$TYPE" = "all" ]; then
        install_frontend_dependencies_if_needed
        start_frontend
    fi

    if [ "$TYPE" = "all" ]; then
        echo_green "Development servers started, open http://localhost:8081 in browser, press Ctrl+C to stop."
    else
        echo_green "$TYPE dev server started, press Ctrl+C to stop."
    fi

    trap 'stop_dev_servers; exit 0' INT TERM

    while true
    do
        sleep 1

        if [ -n "$BACKEND_PID" ] && ! process_is_alive "$BACKEND_PID"; then
            echo_red "Error: backend server exited unexpectedly"
            stop_dev_servers
            exit 1
        fi

        if [ -n "$FRONTEND_PID" ] && ! process_is_alive "$FRONTEND_PID" ]; then
            echo_red "Error: frontend dev server exited unexpectedly"
            stop_dev_servers
            exit 1
        fi
    done
}

main "$@"
