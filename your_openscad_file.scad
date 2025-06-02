// Vibrating Alarm Clock Chassis
// Designed for Raspberry Pi on breadboard with OLED display

// Global parameters
$fn = 50; // Resolution for curved surfaces

// Wall thickness
wall_thickness = 1.2;

// Internal dimensions
internal_width = 165;   // Breadboard width + minimal clearance
internal_depth = 65;    // Breadboard depth + Pi + minimal clearance  
internal_height = 40;   // Height for breadboard + Pi + connections

// Button hole diameter (threaded)
button_diameter = 6.7;
button_thread_depth = 3; // Reduced thickness for threading

// OLED display dimensions
oled_width = 27.4;
oled_height = 19.1;
oled_mounting_hole_diameter = 2.5; // Standard M2.5 screws
oled_mounting_spacing_x = 25;      // Approximate spacing between holes
oled_mounting_spacing_y = 15;      // Approximate spacing between holes

// USB port dimensions (micro USB) - increased height clearance
usb_width = 8;
usb_height = 4.3; // Increased by 1mm for clearance

// External dimensions
external_width = internal_width + 2 * wall_thickness;
external_depth = internal_depth + 2 * wall_thickness;
external_height = internal_height + wall_thickness; // Bottom wall

// Top lid thickness (increased for button threading)
top_thickness = wall_thickness + button_thread_depth;

// Wire grommet diameter (increased to 19.2mm)
grommet_diameter = 19.2;

// Corner radius for rounded edges
corner_radius = 5;

// Fitting clearance for 3D printing
fit_clearance = 0.2; // Clearance between lid and main body for good fit

// Lid insert depth (how far the lid goes into the box)
lid_insert_depth = 4; // Small insertion depth for secure fit

// Brim dimensions for lid
brim_width = 2; // Width of the brim around the lid
brim_thickness = 0.8; // Thickness of the brim

// Lip dimensions for removable top (increased clearances for better fit)
lip_height = 1;
lip_thickness = 1.2; // Increased from 0.8 for looser fit

// Main assembly - choose what to render
render_main_body = true;
render_top = false;
render_assembled = false; // Set to true to see assembled view

if (render_assembled) {
    // Assembled view
    main_body();
    translate([0, 0, external_height]) top_lid();
} else {
    // Separate parts for printing
    if (render_main_body) {
        main_body();
    }
    
    if (render_top) {
        translate([0, external_depth * 2 + 15, top_thickness]) 
        rotate([180, 0, 0])
        top_lid();
    }
} 
module main_body() {
    difference() {
        // Main body exterior
        rounded_box(external_width, external_depth, external_height, corner_radius);
        
        // Internal cavity
        translate([wall_thickness, wall_thickness, wall_thickness])
        rounded_box(internal_width, internal_depth, internal_height + 1, corner_radius - wall_thickness);
        
        // Front panel cutouts
        front_panel_cutouts();
        
        // Side panel cutout for Raspberry Pi USB port
        side_panel_cutouts();
    }
}

module top_lid() {
    difference() {
        // Lid that fits inside the box with clearance
        rounded_box(internal_width - 2 * fit_clearance, internal_depth - 2 * fit_clearance, top_thickness, corner_radius - wall_thickness);
        
        // Button hole (threaded)
        translate([internal_width/2, internal_depth/2, -1])
        cylinder(h = top_thickness + 2, d = button_diameter);
    }
}

module front_panel_cutouts() {
    // Calculate positions for side-by-side centered layout
    total_width = oled_width + grommet_diameter + 10; // 10mm spacing between them
    start_x = (external_width - total_width) / 2;
    center_height = external_height * 0.6;
    
    // OLED display cutout (left side of center)
    oled_center_x = start_x + oled_width/2;
    oled_center_z = center_height;
    
    translate([start_x, -1, center_height - oled_height/2])
    cube([oled_width, wall_thickness + 2, oled_height]);
    
    // OLED pin cutout (separate rectangular cutout at same height as top screw holes)
    pin_cutout_width = 12; // Wide enough for 4 pins with spacing
    pin_cutout_height = 3; // Height to clear soldered pins
    pin_cutout_x = start_x + (oled_width - pin_cutout_width) / 2; // Center on OLED
    pin_cutout_z = oled_center_z + oled_height/2 + 1 - pin_cutout_height/2; // Same Z as top screw holes
    
    translate([pin_cutout_x, -1, pin_cutout_z])
    cube([pin_cutout_width, wall_thickness + 2, pin_cutout_height]);
    
    // OLED mounting holes (M2.5 screws) - positioned inside OLED area
    // Inset from edges by 2mm, bottom holes below display cutout
    hole_inset = 1.5;
    bottom_hole_offset = 3; // Distance below display cutout
    hole_depth = wall_thickness + 10; // Extend into internal cavity
    
    // Bottom left
    translate([start_x + hole_inset - oled_mounting_hole_diameter/2 + 2, -1, 2 + oled_center_z - oled_height/2 - bottom_hole_offset - oled_mounting_hole_diameter/2])
    cube([oled_mounting_hole_diameter, hole_depth, oled_mounting_hole_diameter]);
    
    // Bottom right
    translate([start_x + oled_width - hole_inset - oled_mounting_hole_diameter/2, -1, 2+ oled_center_z - oled_height/2 - bottom_hole_offset - oled_mounting_hole_diameter/2])
    cube([oled_mounting_hole_diameter, hole_depth, oled_mounting_hole_diameter]);
    
    // Top left
    translate([start_x + hole_inset - oled_mounting_hole_diameter/2, -1, oled_center_z + oled_height/2 + 1 - oled_mounting_hole_diameter/2])
    cube([oled_mounting_hole_diameter, hole_depth, oled_mounting_hole_diameter]);
    
    // Top right
    translate([start_x + oled_width - hole_inset - oled_mounting_hole_diameter/2, -1, oled_center_z + oled_height/2 + 1- oled_mounting_hole_diameter/2])
    cube([oled_mounting_hole_diameter, hole_depth, oled_mounting_hole_diameter]);
    
    // Wire grommet hole (right side of center)
    translate([start_x + oled_width + 10 + grommet_diameter/2, -1, center_height])
    rotate([-90, 0, 0])
    cylinder(h = wall_thickness + 2, d = grommet_diameter);
}

module side_panel_cutouts() {
    // Raspberry Pi micro USB port cutout on the right side
    // From breadboard bottom: bottom of port at 12.2mm, top at 15.5mm
    translate([external_width - wall_thickness - 1, external_depth/2 - usb_width/2, wall_thickness + 12.2])
    cube([wall_thickness + 2, usb_width, usb_height]);
}

module rounded_box(width, depth, height, radius) {
    hull() {
        // Bottom corners
        translate([radius, radius, 0])
        cylinder(h = height, r = radius);
        
        translate([width - radius, radius, 0])
        cylinder(h = height, r = radius);
        
        translate([radius, depth - radius, 0])
        cylinder(h = height, r = radius);
        
        translate([width - radius, depth - radius, 0])
        cylinder(h = height, r = radius);
    }
}

// Print instructions as comments:
/*
PRINTING INSTRUCTIONS:
1. Print main_body upright (as oriented in separate parts view)
2. Print top_lid upside down (as oriented in separate parts view) - the brim will be on the print bed
3. Use 0.2mm layer height
4. 20-30% infill is sufficient
5. Support material needed for wire grommet hole overhang
6. No supports needed for other features
7. The brim around the lid helps with bed adhesion and provides a snug fit

ASSEMBLY:
1. Place breadboard on bottom inside main body
2. Place Raspberry Pi on breadboard
3. Install OLED display in front cutout
4. Thread motor wire through grommet hole and install grommet
5. Install button through top lid
6. Place top lid on main body - inner part fits inside cavity with 0.2mm clearance

DIMENSIONS:
- External: 176mm x 76mm x 48mm
- Internal cavity: 170mm x 70mm x 45mm
- Wall thickness: 3mm
- Lid has brim for better fit and printing
*/