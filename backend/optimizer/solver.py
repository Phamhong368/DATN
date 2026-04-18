import json
import math
import sys
import unicodedata

from ortools.constraint_solver import pywrapcp
from ortools.constraint_solver import routing_enums_pb2

PLANNING_HORIZON_MINUTES = 72 * 60


CITY_COORDINATES = {
    "ha noi": {"lat": 21.0285, "lng": 105.8542},
    "hai phong": {"lat": 20.8449, "lng": 106.6881},
    "bac ninh": {"lat": 21.1861, "lng": 106.0763},
    "thanh hoa": {"lat": 19.8067, "lng": 105.7852},
    "nghe an": {"lat": 18.6796, "lng": 105.6813},
    "hue": {"lat": 16.4637, "lng": 107.5909},
    "da nang": {"lat": 16.0544, "lng": 108.2022},
    "quang ngai": {"lat": 15.1214, "lng": 108.8044},
    "nha trang": {"lat": 12.2388, "lng": 109.1967},
    "khanh hoa": {"lat": 12.2585, "lng": 109.0526},
    "lam dong": {"lat": 11.9404, "lng": 108.4583},
    "dong nai": {"lat": 10.9574, "lng": 106.8426},
    "binh duong": {"lat": 11.3254, "lng": 106.4770},
    "vung tau": {"lat": 10.4114, "lng": 107.1362},
    "thu duc": {"lat": 10.8491, "lng": 106.7537},
    "tp.hcm": {"lat": 10.7769, "lng": 106.7009},
    "tp. hcm": {"lat": 10.7769, "lng": 106.7009},
    "ho chi minh": {"lat": 10.7769, "lng": 106.7009},
    "hcm": {"lat": 10.7769, "lng": 106.7009},
    "long an": {"lat": 10.6956, "lng": 106.2431},
    "can tho": {"lat": 10.0452, "lng": 105.7469},
}


def normalize_location(value):
    normalized = unicodedata.normalize("NFD", str(value or "").replace("đ", "d").replace("Đ", "D").lower())
    ascii_text = "".join(character for character in normalized if unicodedata.category(character) != "Mn")
    return " ".join(ascii_text.replace(",", " ").split())


def resolve_coordinate(location):
    normalized = normalize_location(location)
    for key, coordinate in CITY_COORDINATES.items():
        if key in normalized:
            return coordinate
    return None


def haversine_distance_km(origin, destination):
    radius_km = 6371
    lat_delta = math.radians(destination["lat"] - origin["lat"])
    lng_delta = math.radians(destination["lng"] - origin["lng"])
    origin_lat = math.radians(origin["lat"])
    destination_lat = math.radians(destination["lat"])
    arc = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(origin_lat) * math.cos(destination_lat) * math.sin(lng_delta / 2) ** 2
    )
    return radius_km * (2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc)))


def distance_to_minutes(distance_km):
    average_speed_kmph = 48
    return int(round((distance_km / average_speed_kmph) * 60))


def parse_time_window(value, fallback):
    if value is None or value == "":
        return fallback
    if isinstance(value, (int, float)):
        return int(value)
    parts = str(value).split(":")
    if len(parts) != 2:
        return fallback
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        return hours * 60 + minutes
    except ValueError:
        return fallback


def format_clock(total_minutes):
    hours = str(int(total_minutes // 60)).zfill(2)
    minutes = str(int(total_minutes % 60)).zfill(2)
    return f"{hours}:{minutes}"


def build_nodes(payload):
    depot_location = payload.get("depot", {}).get("location") or payload.get("depot", {}).get("name")
    depot_coordinate = resolve_coordinate(depot_location)
    if not depot_coordinate:
        raise ValueError("Không xác định được tọa độ kho xuất phát.")

    depot_node = {
        "id": "depot",
        "location": depot_location,
        "coordinate": depot_coordinate,
        "demand": 0,
        "service_minutes": 0,
        "window_start": 0,
        "window_end": PLANNING_HORIZON_MINUTES,
    }

    orders = []
    invalid_orders = []
    for order in payload.get("orders", []):
        coordinate = resolve_coordinate(order.get("delivery_location") or order.get("location"))
        if not coordinate:
            invalid_orders.append(order.get("delivery_location") or order.get("order_code"))
            continue
        orders.append(
            {
                "id": order.get("id"),
                "order_code": order.get("order_code"),
                "customer_name": order.get("customer_name"),
                "delivery_location": order.get("delivery_location"),
                "cargo_type": order.get("cargo_type"),
                "weight_tons": float(order.get("weight_tons") or 0),
                "coordinate": coordinate,
                "service_minutes": int(order.get("serviceMinutes") or 20),
                "window_start": parse_time_window(order.get("windowStart"), 0),
                "window_end": parse_time_window(order.get("windowEnd"), PLANNING_HORIZON_MINUTES),
            }
        )

    if invalid_orders:
        raise ValueError("Không xác định được tọa độ cho điểm giao: " + ", ".join(invalid_orders))

    return depot_node, orders


def build_matrices(depot_node, orders):
    nodes = [depot_node] + orders
    distance_matrix = []
    time_matrix = []
    for origin in nodes:
        distance_row = []
        time_row = []
        for destination in nodes:
            if origin["id"] == destination["id"]:
                distance_row.append(0)
                time_row.append(0)
                continue
            distance_km = haversine_distance_km(origin["coordinate"], destination["coordinate"])
            distance_row.append(int(round(distance_km * 1000)))
            time_row.append(distance_to_minutes(distance_km) + int(destination.get("service_minutes", 0)))
        distance_matrix.append(distance_row)
        time_matrix.append(time_row)
    return nodes, distance_matrix, time_matrix


def solve_vrp(payload):
    depot_node, orders = build_nodes(payload)
    trucks = payload.get("trucks", [])
    if not trucks:
        raise ValueError("Không có xe để tối ưu.")

    nodes, distance_matrix, time_matrix = build_matrices(depot_node, orders)
    demands = [0] + [int(round(order["weight_tons"] * 100)) for order in orders]
    capacities = [int(round(float(truck.get("capacity_tons") or 0) * 100)) for truck in trucks]

    manager = pywrapcp.RoutingIndexManager(len(nodes), len(trucks), 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        origin = manager.IndexToNode(from_index)
        destination = manager.IndexToNode(to_index)
        return distance_matrix[origin][destination]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    def demand_callback(from_index):
        node = manager.IndexToNode(from_index)
        return demands[node]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,
        capacities,
        True,
        "Capacity",
    )

    def time_callback(from_index, to_index):
        origin = manager.IndexToNode(from_index)
        destination = manager.IndexToNode(to_index)
        return time_matrix[origin][destination]

    time_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.AddDimension(
        time_callback_index,
        12 * 60,
        PLANNING_HORIZON_MINUTES,
        False,
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")

    for node_index, order in enumerate(orders, start=1):
        index = manager.NodeToIndex(node_index)
        time_dimension.CumulVar(index).SetRange(order["window_start"], order["window_end"])
        routing.AddDisjunction([index], 100_000_000)

    depot_index = manager.NodeToIndex(0)
    time_dimension.CumulVar(depot_index).SetRange(0, PLANNING_HORIZON_MINUTES)

    for vehicle_id in range(len(trucks)):
        start_index = routing.Start(vehicle_id)
        end_index = routing.End(vehicle_id)
        shift_start = parse_time_window(trucks[vehicle_id].get("shiftStart"), 7 * 60)
        time_dimension.CumulVar(start_index).SetRange(shift_start, PLANNING_HORIZON_MINUTES)
        time_dimension.CumulVar(end_index).SetRange(0, PLANNING_HORIZON_MINUTES)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_parameters.time_limit.seconds = 5

    solution = routing.SolveWithParameters(search_parameters)
    if not solution:
        raise ValueError("OR-Tools không tìm được phương án phù hợp với ràng buộc hiện tại.")

    routes = []
    assigned_nodes = set()
    total_distance_km = 0

    for vehicle_id, truck in enumerate(trucks):
        index = routing.Start(vehicle_id)
        route_distance_m = 0
        route_load = 0
        stops = []
        previous_node = 0

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                assigned_nodes.add(node)
                order = orders[node - 1]
                previous_distance_m = distance_matrix[previous_node][node]
                arrival = solution.Value(time_dimension.CumulVar(index))
                departure = arrival + int(order["service_minutes"])
                stops.append(
                    {
                        "orderId": order["id"],
                        "orderCode": order["order_code"],
                        "customerName": order["customer_name"],
                        "destination": order["delivery_location"],
                        "cargoType": order["cargo_type"],
                        "weightTons": order["weight_tons"],
                        "distanceFromPreviousKm": round(previous_distance_m / 1000, 1),
                        "durationFromPreviousMinutes": max(0, distance_to_minutes(previous_distance_m / 1000)),
                        "arrivalTime": format_clock(arrival),
                        "serviceStartTime": format_clock(arrival),
                        "departureTime": format_clock(departure),
                        "windowLabel": f"{format_clock(order['window_start'])} - {format_clock(order['window_end'])}",
                    }
                )
                route_load += order["weight_tons"]
                previous_node = node

            next_index = solution.Value(routing.NextVar(index))
            route_distance_m += routing.GetArcCostForVehicle(index, next_index, vehicle_id)
            index = next_index

        if stops:
            route_distance_km = round(route_distance_m / 1000, 1)
            total_distance_km += route_distance_km
            route_end_minutes = solution.Value(time_dimension.CumulVar(index))
            route_start_minutes = solution.Value(time_dimension.CumulVar(routing.Start(vehicle_id)))
            routes.append(
                {
                    "truckId": truck["id"],
                    "truckLabel": truck.get("license_plate") or truck.get("name") or f"Xe {truck['id']}",
                    "capacityTons": float(truck.get("capacity_tons") or 0),
                    "stops": stops,
                    "totalDistanceKm": route_distance_km,
                    "totalDurationMinutes": int(route_end_minutes - route_start_minutes),
                    "totalLoadTons": round(route_load, 2),
                    "utilizationPercent": int(round((route_load / float(truck.get("capacity_tons") or 1)) * 100)),
                }
            )

    unassigned_orders = []
    for node, order in enumerate(orders, start=1):
        if node not in assigned_nodes:
            unassigned_orders.append(
                {
                    "orderId": order["id"],
                    "orderCode": order["order_code"],
                    "destination": order["delivery_location"],
                    "weightTons": order["weight_tons"],
                    "reason": "Không thể gán vào tuyến phù hợp theo OR-Tools với tải trọng hoặc time window hiện tại.",
                }
            )

    return {
        "meta": {
            "algorithm": "Google OR-Tools VRPTW",
            "totalRoutes": len(routes),
            "totalAssignedOrders": sum(len(route["stops"]) for route in routes),
            "totalUnassignedOrders": len(unassigned_orders),
            "totalDistanceKm": round(total_distance_km, 1),
        },
        "routes": routes,
        "unassignedOrders": unassigned_orders,
    }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = solve_vrp(payload)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        sys.stderr.write(str(error))
        sys.exit(1)


if __name__ == "__main__":
    main()
PLANNING_HORIZON_MINUTES = 72 * 60
