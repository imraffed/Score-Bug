import SwiftUI
import WidgetKit

@main
struct ScoreBugWidgetsBundle: WidgetBundle {
    var body: some Widget {
        ScoreBugLiveActivity()
        ScoreWidget()
    }
}
